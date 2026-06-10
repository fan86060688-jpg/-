import { stat } from "node:fs/promises";

export function buildWorkflowPlan({ orders, config, processedProductIds }) {
  const products = dedupeProducts(orders).filter(
    (product) => !processedProductIds.has(product.productId)
  );

  const videos = [];
  for (const product of products) {
    const targetAccount = resolveTargetAccount(config, product);
    if (!targetAccount) {
      throw new Error(`No account mapping configured for category "${product.category}" and site "${product.site ?? ""}"`);
    }

    for (let index = 0; index < config.videoCountPerProduct; index += 1) {
      videos.push({
        videoId: `${product.productId}-${index + 1}`,
        productId: product.productId,
        productName: product.productName,
        category: product.category,
        site: product.site,
        country: product.country,
        mainImage: product.mainImage,
        index,
        status: "pending_confirmation",
        targetAccount,
        caption: renderCaption(targetAccount.captionTemplate, product)
      });
    }
  }

  return { products, videos };
}

export async function runWorkflow({ config, store, adapters }) {
  const startedAt = new Date().toISOString();
  const run = {
    startedAt,
    status: "running",
    videosCreated: 0,
    productsProcessed: 0
  };

  try {
    const orders = await adapters.miaoshou.listOrdersSinceLastRun({
      since: store.lastSuccessfulRunAt
    });
    const plan = buildWorkflowPlan({
      orders,
      config,
      processedProductIds: new Set(store.processedProductIds())
    });

    const videosByProduct = groupVideosByProduct(plan.videos);
    const completedVideos = [];

    for (const product of plan.products) {
      const promptGenerator = adapters.promptGenerator ?? adapters.gpt ?? adapters.gemini;
      if (!promptGenerator) {
        throw new Error("No prompt generator adapter configured.");
      }
      const prompts = await promptGenerator.createPrompts({
        product,
        count: config.videoCountPerProduct
      });
      const captions = promptGenerator.createCaptions
        ? await promptGenerator.createCaptions({
            product,
            count: config.videoCountPerProduct
          })
        : [];

      if (!Array.isArray(prompts) || prompts.length < config.videoCountPerProduct) {
        throw new Error(
          `Prompt generator returned ${prompts?.length ?? 0} prompts for "${product.productName}", expected ${config.videoCountPerProduct}`
        );
      }
      if (promptGenerator.createCaptions && (!Array.isArray(captions) || captions.length < config.videoCountPerProduct)) {
        throw new Error(
          `Caption generator returned ${captions?.length ?? 0} captions for "${product.productName}", expected ${config.videoCountPerProduct}`
        );
      }

      const productVideos = videosByProduct.get(product.productId) ?? [];
      for (const video of productVideos) {
        const prompt = prompts[video.index];
        const caption = captions[video.index] ?? video.caption;
        const created = adapters.videoCreator
          ? await adapters.videoCreator.createVideo({ product, prompt, index: video.index })
          : {};
        const queued = await adapters.neobund.enqueueForConfirmation({
          ...video,
          prompt,
          caption,
          captionSource: captions[video.index] ? "gpt" : "template",
          filePath: created.filePath
        });
        const completed = {
          ...video,
          prompt,
          caption,
          captionSource: captions[video.index] ? "gpt" : "template",
          filePath: created.filePath,
          confirmationId: queued.confirmationId
        };
        store.saveVideo(completed);
        completedVideos.push(completed);
      }

      store.markProductProcessed(product);
    }

    run.status = "success";
    run.productsProcessed = plan.products.length;
    run.videosCreated = completedVideos.length;
    run.finishedAt = new Date().toISOString();
    store.recordRun(run);

    return {
      products: plan.products,
      videos: completedVideos
    };
  } catch (error) {
    run.status = "failed";
    run.error = error.message;
    run.finishedAt = new Date().toISOString();
    store.recordRun(run);
    throw error;
  }
}

export async function publishConfirmedVideos({ store, adapters }) {
  const published = [];
  for (const video of store.confirmedVideos()) {
    const event = await adapters.neobund.publishConfirmed(video);
    store.markVideoPublished(video.videoId, event);
    published.push({ ...video, publishEvent: event });
  }
  return published;
}

export async function renderMissingVideoFiles({ store, adapters, productIds = null }) {
  if (!adapters.videoCreator) {
    throw new Error("No video creator adapter configured.");
  }
  const rendered = [];
  const candidates = [];
  const productIdSet = productIds ? new Set(productIds) : null;
  for (const video of store.pendingVideos()) {
    if (productIdSet && !productIdSet.has(video.productId)) {
      continue;
    }
    if (!video.filePath || !(await isUsableVideoFile(video.filePath))) {
      candidates.push(video);
    }
  }
  for (const video of candidates) {
    const created = await adapters.videoCreator.createVideo({
      product: video,
      prompt: video.prompt,
      index: video.index
    });
    const updated = { ...video, filePath: created.filePath };
    store.saveVideo(updated);
    rendered.push(updated);
  }
  return rendered;
}

export function cleanupDemoData(store) {
  const demoProductIds = new Set();
  for (const [productId, product] of Object.entries(store.products ?? {})) {
    if (isDemoItem(product)) {
      demoProductIds.add(productId);
      delete store.products[productId];
    }
  }
  for (const [videoId, video] of Object.entries(store.videos ?? {})) {
    if (demoProductIds.has(video.productId) || isDemoItem(video)) {
      delete store.videos[videoId];
    }
  }
  store.publishEvents = (store.publishEvents ?? []).filter((event) => !demoProductIds.has(event.productId));
  return demoProductIds.size;
}

export function refreshPendingAccountMappings(store, config) {
  const refreshed = { updated: 0, blocked: 0 };
  for (const [videoId, video] of Object.entries(store.videos ?? {})) {
    if (video.status !== "pending_confirmation") {
      continue;
    }
    const targetAccount = resolveTargetAccount(config, video);
    if (!targetAccount) {
      store.videos[videoId] = {
        ...video,
        status: "blocked_account_mapping",
        accountError: `No account mapping configured for category "${video.category}" and site "${video.site ?? video.country ?? ""}"`
      };
      refreshed.blocked += 1;
      continue;
    }
    store.videos[videoId] = {
      ...video,
      targetAccount,
      caption: video.captionSource === "gpt" ? video.caption : renderCaption(targetAccount.captionTemplate, video),
      accountError: undefined
    };
    refreshed.updated += 1;
  }
  return refreshed;
}

function isDemoItem(item) {
  return (
    String(item.productId ?? "").startsWith("product-") ||
    String(item.mainImage ?? "").includes("example.com") ||
    ["LED Mirror", "Lip Gloss"].includes(item.productName)
  );
}

async function isUsableVideoFile(filePath) {
  try {
    const info = await stat(filePath);
    return info.size > 10000;
  } catch {
    return false;
  }
}

function dedupeProducts(orders) {
  const seen = new Set();
  const products = [];
  for (const order of orders) {
    if (seen.has(order.productId)) {
      continue;
    }
    seen.add(order.productId);
    products.push({
      productId: order.productId,
      productName: order.productName,
      category: order.category,
      site: order.site,
      country: order.country,
      mainImage: order.mainImage,
      firstOrderId: order.orderId
    });
  }
  return products;
}

function groupVideosByProduct(videos) {
  const map = new Map();
  for (const video of videos) {
    const list = map.get(video.productId) ?? [];
    list.push(video);
    map.set(video.productId, list);
  }
  return map;
}

function renderCaption(template, product) {
  return template
    .replaceAll("{productName}", product.productName)
    .replaceAll("{category}", product.category)
    .replaceAll("{site}", product.site ?? "")
    .replaceAll("{country}", product.country ?? "");
}

function resolveTargetAccount(config, product) {
  const site = product.site || product.country;
  return (
    config.categorySiteAccounts?.[`${product.category}:${site}`] ??
    config.categorySiteAccounts?.[`${product.category}:${product.country}`] ??
    config.categoryAccounts[product.category] ??
    config.siteAccounts?.[site] ??
    config.siteAccounts?.[product.country]
  );
}
