export function createOpenAIPromptAdapter({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL ?? "gpt-4.1",
  fetchImpl = fetch,
  allowFallback = false
} = {}) {
  return {
    async createPrompts({ product, count }) {
      if (!apiKey) {
        if (allowFallback) {
          return buildFallbackPrompts(product, count);
        }
        throw new Error("OPENAI_API_KEY is required before generating GPT video prompts.");
      }
      const data = await callOpenAI({
        apiKey,
        model,
        fetchImpl,
        input: buildVideoScriptInput(product, count),
        errorPrefix: "OpenAI video prompt generation"
      });
      return parseExactList(data, count, "video prompts");
    },

    async createCaptions({ product, count }) {
      if (!apiKey) {
        if (allowFallback) {
          return buildFallbackCaptions(product, count);
        }
        throw new Error("OPENAI_API_KEY is required before generating GPT video titles.");
      }
      const data = await callOpenAI({
        apiKey,
        model,
        fetchImpl,
        input: buildGermanCaptionInput(product, count),
        errorPrefix: "OpenAI title generation"
      });
      return parseExactList(data, count, "titles");
    }
  };
}

async function callOpenAI({ apiKey, model, fetchImpl, input, errorPrefix }) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input })
  });

  if (!response.ok) {
    const detail = await safeResponseText(response);
    throw new Error(`${errorPrefix} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

async function safeResponseText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

function parseExactList(data, count, label) {
  const items = parsePromptResponse(data).slice(0, count);
  if (items.length < count) {
    throw new Error(`OpenAI returned ${items.length} ${label}, expected ${count}`);
  }
  return items;
}

function buildVideoScriptInput(product, count) {
  const targetCountry = product.country || product.site;
  if (!targetCountry) {
    throw new Error(`Target country is required before generating TikTok scripts for "${product.productName}".`);
  }
  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildVideoScriptInstruction(product, count, targetCountry)
        },
        {
          type: "input_image",
          image_url: product.mainImage
        }
      ]
    }
  ];
}

function buildGermanCaptionInput(product, count) {
  const targetCountry = product.country || product.site || "DE";
  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildGermanCaptionInstruction(product, count, targetCountry)
        },
        {
          type: "input_image",
          image_url: product.mainImage
        }
      ]
    }
  ];
}

function buildVideoScriptInstruction(product, count, targetCountry) {
  return [
    "你是TikTok带货视频脚本设计专家，擅长结合平台热门内容形式（如开箱、POV沉浸式体验等），基于产品信息生成精准适配的标准化分镜脚本。当我向你提供「产品图」和「产品简单描述」时，请严格按照以下规则执行任务：",
    "",
    "### 一、核心任务目标",
    "1. 分析产品核心信息：基于产品图和描述，提炼产品卖点（如功能、设计、材质等）、匹配目标国家、定位精准受众画像（年龄、性别、消费场景偏好等）；",
    "2. 匹配TikTok热门脚本类型：自动分类为「开箱测评」「POV第一视角沉浸式体验」「功能测评」「ugc场景化种草」「对镜真人口播」「反转剧情类」「AMSR」「模特展示」「产品使用过程展示」等平台高转化类型，并植入爆款短视频结构（前三秒钩子、中间部分展示卖点、产品细节、不同使用场景、实力背书、后3秒CTA引导下单等）；",
    "3. 生成标准化分镜表：包含| 镜号 | 景别/角度 | 运动 | 画面内容 | 音频 | 时长(秒) | 6个必填字段；",
    "4. 总结风格规范：明确视频的画面风格（光线、背景、镜头逻辑）和音频风格（BGM、旁白、音效要求）。",
    "",
    "### 二、执行规则",
    `1. 目标国家已提供：${targetCountry}，不需要反问目标国家；`,
    "2. 热门脚本适配逻辑：优先选择目标国家TikTok同品类近期（30天内）高赞视频的主流形式，并严格植入爆款结构：前三秒强钩子吸引停留，后3秒清晰CTA引导下单；",
    "3. 分镜表约束：每条脚本必须是15秒视频，每镜时长需标注具体数值（精确到1秒），画面内容需结合产品卖点设计，且需明确体现前三秒钩子、后3秒CTA的结构布局；",
    "4. 风格总结要求：需明确光线类型、背景选择、旁白风格、音效使用。",
    "",
    "### 三、输出格式",
    "1. 先输出「核心信息分析」（产品卖点、目标国、受众画像、脚本类型）；",
    "2. 再输出标准化分镜表，严格按| 镜号 | 景别/角度 | 运动 | 画面内容 | 音频 | 时长(秒) | 格式呈现；",
    "3. 最后输出「画面风格总结」和「音频风格总结」。",
    "",
    "### 四、给 Dreamina Seedance 2.0 的额外要求",
    "1. 每条脚本必须可以直接粘贴到 TikTok Creative Studio / Dreamina Seedance 2.0；",
    "2. 如果产品图包含真人脸部，请在脚本中明确要求避免脸部特写、保持脸部出框或使用无脸产品局部画面；",
    "3. 不要生成夸张承诺，不要改变产品颜色、结构、图案、拉链、材质和穿着方式；",
    "4. 输出内容尽量使用英文分镜描述，避免网页输入时乱码；德语只用于画面文字或旁白。",
    "",
    `请基于同一个产品生成 exactly ${count} 条不同的视频制作提示词。`,
    "每条脚本要有不同热门脚本类型或不同卖点角度。",
    "最终返回 JSON only：一个字符串数组，每个字符串是一条完整可直接粘贴到 TikTok Creative Studio / Dreamina Seedance 2.0 的15秒视频提示词。不要输出 markdown，不要输出 JSON 之外的文字。",
    "",
    `产品简单描述：${product.productName}`,
    `产品类目：${product.category}`,
    `目标国家：${targetCountry}`
  ].join("\n");
}

function buildGermanCaptionInstruction(product, count, targetCountry) {
  return [
    "# 德国TikTok短视频产品策划智能体 (System Prompt)",
    "",
    "## 【角色设定】",
    "你是一位资深的德国市场TikTok内容策划专家与产品分析师。当接收到我提供的产品信息（无论是图片、视频截图还是文字描述）时，你的任务是精准剖析该产品，并为其创作高转化潜力、完全符合德国本土用户喜好的TikTok短视频标题与话题标签。",
    "",
    "## 【核心原则与文案风格】",
    "1. 真实客观：德国受众极其看重真实性、逻辑性和实用性，偏好客观的生活方式叙事。",
    "2. 禁止夸张营销：绝对禁止使用过度包装的营销词汇（如“史上最强”、“绝对好用”）、最高级形容词，以及带有强烈压迫感的催促购买术语（如“立刻买”、“不买后悔”）。",
    "3. 场景代入：文案应展现产品如何自然地融入使用者的真实生活场景，口吻像是一个理性的朋友在做客观的好物分享或测评。",
    "",
    "## 【工作流与输出格式】",
    "当接收到产品信息后，请严格按照以下三个模块进行回复：",
    "",
    "### 一、产品多维分析",
    "* 核心实用价值：(冷静客观地提炼出1-2个解决实际痛点的功能)",
    "* 目标受众画像：(具体指出适合哪类德国本土人群，例如：追求高效的职场人、注重生活品质的居家爱好者等)",
    "* 核心使用场景：(结合真实的德国生活场景，给出1-2个最适合拍摄短视频的画面设定)",
    "",
    "### 二、10个德国本土化TikTok短视频标题 (附中文翻译)",
    "* 结合上述分析，提供10个不同切入点（如：痛点解决型、生活场景型、ASMR沉浸型、客观测评型等）的标题。",
    "* 标题必须符合TikTok的阅读习惯，简明扼要。",
    "* 格式要求：1. [德语原标题] - [精准的中文翻译]",
    "",
    "### 三、流量与垂直话题标签 (附中文翻译)",
    "* 提供5-8个标签的黄金组合策略（2个大流量泛标签 + 3个产品垂直标签 + 1-2个使用场景标签）。",
    "* 格式要求：#[德文标签] - [中文翻译]",
    "",
    "## 【交互开始】",
    "请以这句话作为开场白等待用户输入：“我已经准备好了，请随时发送您的产品图片或描述，我将为您生成定制化的德国TikTok内容方案。”然后给图给GPT做视频标题。",
    "",
    `现在直接处理以下产品，不要等待二次输入。目标国家：${targetCountry}。`,
    `产品信息：${product.productName}`,
    `产品类目：${product.category}`,
    "",
    `请输出 exactly ${count} 条可直接用于 Neobund/TikTok 发布的视频标题文案。`,
    "每条必须包含：德语标题 + 5-8个德语 hashtag。",
    "标题和标签必须适合德国本土用户，避免夸张营销和强催促购买。",
    "最终返回 JSON only：一个字符串数组。每个字符串格式为：德语标题\\n#标签1 #标签2 #标签3 #标签4 #标签5。不要输出 markdown，不要输出 JSON 之外的文字。"
  ].join("\n");
}

function buildFallbackPrompts(product, count) {
  return Array.from({ length: count }, (_, index) =>
    [
      `Core information analysis: Product is ${product.productName}. Target country is ${product.country || product.site || "DE"}.`,
      "| Shot | Framing/Angle | Motion | Visual content | Audio | Duration(sec) |",
      "| 1 | Medium close-up | Fast push-in | 0-3s hook, show the product clearly from the source image | Light BGM | 3 |",
      "| 2 | Full product view | Slow tilt | Show the product shape and main use case | Natural ambience | 3 |",
      "| 3 | Macro detail | Smooth push-in | Show material, structure, or function detail | Detail sound effect | 3 |",
      "| 4 | Lifestyle scene | Tracking move | Show realistic use scenario | Short voiceover | 3 |",
      "| 5 | Hero shot | Slow push-in | Final 3s CTA to view product details | CTA sound | 3 |",
      `Visual style: natural light, clean realistic scene. Audio style: light BGM and real environment sound. Variation ${index + 1}.`
    ].join("\n")
  );
}

function buildFallbackCaptions(product, count) {
  const title = `${shortProductName(product.productName)} im Alltag getestet`;
  const tags = "#TikTokDeutschland #Produkttest #Bademode #Strandoutfit #Sommerlook #OutdoorStyle";
  return Array.from({ length: count }, (_, index) => `${title} ${index + 1}\n${tags}`);
}

function shortProductName(name) {
  return String(name).replace(/\s+/g, " ").slice(0, 80);
}

function parsePromptResponse(data) {
  const text = data.output_text ?? extractOutputText(data);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:\d+[\).]|[-*])\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function extractOutputText(data) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}
