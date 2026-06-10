# 自动短视频制作发布

本项目现在的主流程是：

1. 读取妙手出单产品。
2. 每个出单产品用 GPT 生成 10 条差异化视频制作提示词。
3. 10 条内容全部进入待确认队列。
4. 只在 Neobund 里处理后续发布，不再调用 Gemini，也不再调用 TikTok Creative Studio。

## 配置

复制示例配置：

```powershell
Copy-Item config/config.example.json config/config.json
```

复制本地密钥示例：

```powershell
Copy-Item .env.example .env.local
```

`.env.local` 不会提交。至少需要：

```env
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1
```

Neobund 使用 Google 登录时，不需要在 `.env.local` 保存 Google 密码。运行：

```powershell
npm run login-neobund-google -- --pause-ms=300000 --after-url=https://www.neobund.ai/en/tiktok-management
```

## 本地测试运行

```powershell
npm test
npm run run
```

审核页：

```text
data/review-queue.html
```

确认某条内容：

```powershell
npm run approve -- --video=<videoId>
```

发布已确认内容：

```powershell
npm run publish -- --live=true
```

## Live 检查

检查真实配置是否还有模板值：

```powershell
npm run check-live
```

当前 Neobund 已采集到发布页信息。剩余需要补的是妙手订单页：

- `liveAutomation.miaoshou.ordersUrl`
- `liveAutomation.miaoshou.orderRow`
- `liveAutomation.miaoshou.fields.orderId`
- `liveAutomation.miaoshou.fields.productId`
- `liveAutomation.miaoshou.fields.productName`
- `liveAutomation.miaoshou.fields.category`
- `liveAutomation.miaoshou.fields.mainImage`

逐页采集候选选择器：

```powershell
npm run inspect-page -- --section=miaoshou --url=<妙手订单页URL> --pause-ms=120000
```

点击后采集：

```powershell
npm run inspect-click -- --section=neobund-create --url=https://www.neobund.ai/en/tiktok-management --click="button:has-text('publishCreate Publish Task')" --pause-ms=10000
```
