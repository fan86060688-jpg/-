import assert from "node:assert/strict";
import { test } from "node:test";

import { createOpenAIPromptAdapter } from "../src/adapters/openai-prompts.js";

test("OpenAI prompt adapter requests ten GPT video prompts with product image", async () => {
  const calls = [];
  const adapter = createOpenAIPromptAdapter({
    apiKey: "test-key",
    model: "gpt-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify([
              "Prompt 1",
              "Prompt 2",
              "Prompt 3",
              "Prompt 4",
              "Prompt 5",
              "Prompt 6",
              "Prompt 7",
              "Prompt 8",
              "Prompt 9",
              "Prompt 10"
            ])
          };
        }
      };
    }
  });

  const prompts = await adapter.createPrompts({
    product: {
      productName: "LED Mirror",
      category: "Home Decor",
      mainImage: "https://example.test/mirror.jpg",
      country: "DE"
    },
    count: 10
  });

  assert.equal(prompts.length, 10);
  assert.equal(prompts[0], "Prompt 1");
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "gpt-test");
  assert.match(body.input[0].content[0].text, /TikTok带货视频脚本设计专家/);
  assert.match(body.input[0].content[0].text, /LED Mirror/);
  assert.match(body.input[0].content[0].text, /15秒视频/);
  assert.equal(body.input[0].content[1].type, "input_image");
  assert.equal(body.input[0].content[1].image_url, "https://example.test/mirror.jpg");
});

test("OpenAI prompt adapter requests German TikTok titles with product image", async () => {
  const calls = [];
  const adapter = createOpenAIPromptAdapter({
    apiKey: "test-key",
    model: "gpt-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify([
              "Badeanzug fuer aktive Strandtage\n#TikTokDeutschland #Produkttest #Bademode #Strandoutfit #Sommerlook",
              "Sportlicher Look am See\n#TikTokDeutschland #Sommerlook #Bademode #OutdoorStyle #Strandtag"
            ])
          };
        }
      };
    }
  });

  const captions = await adapter.createCaptions({
    product: {
      productName: "One-piece rash guard swimsuit",
      category: "Apparel",
      mainImage: "https://example.test/swimsuit.jpg",
      country: "DE"
    },
    count: 2
  });

  assert.equal(captions.length, 2);
  assert.match(captions[0], /#TikTokDeutschland/);
  const body = JSON.parse(calls[0].options.body);
  assert.match(body.input[0].content[0].text, /德国TikTok短视频产品策划智能体/);
  assert.match(body.input[0].content[0].text, /德语标题/);
  assert.equal(body.input[0].content[1].image_url, "https://example.test/swimsuit.jpg");
});

test("OpenAI prompt adapter fails if the model returns too few prompts", async () => {
  const adapter = createOpenAIPromptAdapter({
    apiKey: "test-key",
    model: "gpt-test",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { output_text: JSON.stringify(["one"]) };
      }
    })
  });

  await assert.rejects(
    () =>
      adapter.createPrompts({
        product: { productName: "LED Mirror", category: "Home Decor", mainImage: "image", country: "DE" },
        count: 10
      }),
    /OpenAI returned 1 video prompts, expected 10/
  );
});

test("OpenAI prompt adapter blocks live GPT generation when no API key is configured", async () => {
  const adapter = createOpenAIPromptAdapter({ apiKey: "" });
  const product = {
    productName: "Two piece swimsuit",
    category: "TikTok_Online_Other",
    mainImage: "https://example.test/swimsuit.jpg",
    country: "DE"
  };

  await assert.rejects(() => adapter.createPrompts({ product, count: 10 }), /OPENAI_API_KEY is required/);
  await assert.rejects(() => adapter.createCaptions({ product, count: 10 }), /OPENAI_API_KEY is required/);
});

test("OpenAI prompt adapter can use explicit local fallback for offline tests", async () => {
  const adapter = createOpenAIPromptAdapter({ apiKey: "", allowFallback: true });
  const product = {
    productName: "Two piece swimsuit",
    category: "TikTok_Online_Other",
    mainImage: "https://example.test/swimsuit.jpg",
    country: "DE"
  };

  const prompts = await adapter.createPrompts({ product, count: 10 });
  const captions = await adapter.createCaptions({ product, count: 10 });

  assert.equal(prompts.length, 10);
  assert.match(prompts[0], /Two piece swimsuit/);
  assert.match(prompts[9], /Variation 10/);
  assert.equal(captions.length, 10);
  assert.match(captions[0], /#TikTokDeutschland/);
});
