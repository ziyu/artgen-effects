# Artgen Effects

[English](./README.md) · [Artgen 官网](https://artgen.net)

六种可重复的传统图像风格算法，每种提供独立 npm 包。所有包均无运行时依赖，输入 RGBA 像素，输出新的图像；使用有界 CPU 计算，无需模型、API Key、GPU、原生扩展或容器。

## npm 包与官网工具

可以先在对应的 Artgen 工具页体验效果，再接入自己的项目：

| 风格 | npm 包 | 官网工具页 |
| --- | --- | --- |
| ASCII 字符艺术 | [artgen-ascii](https://www.npmjs.com/package/artgen-ascii) | [ASCII 艺术生成器](https://artgen.net/zh-CN/tools/ascii-art-generator) |
| 像素艺术 | [artgen-pixel](https://www.npmjs.com/package/artgen-pixel) | [图片转像素艺术](https://artgen.net/zh-CN/tools/image-to-pixel-art) |
| 蓝晒 | [artgen-cyanotype](https://www.npmjs.com/package/artgen-cyanotype) | [蓝晒滤镜](https://artgen.net/zh-CN/tools/cyanotype-filter) |
| 孔版印刷 | [artgen-risograph](https://www.npmjs.com/package/artgen-risograph) | [Risograph 效果](https://artgen.net/zh-CN/tools/risograph-effect) |
| 波普艺术 | [artgen-pop-art](https://www.npmjs.com/package/artgen-pop-art) | [照片转波普艺术](https://artgen.net/zh-CN/tools/photo-to-pop-art) |
| 点彩 | [artgen-pointillism](https://www.npmjs.com/package/artgen-pointillism) | [点彩效果](https://artgen.net/zh-CN/tools/pointillism-effect) |

## 快速开始

按需安装一个包：

```bash
npm install artgen-pixel
```

```js
import { convert } from 'artgen-pixel';

const width = 96;
const height = 64;
const data = new Uint8Array(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = Math.round(255 * x / (width - 1));
    data[i + 1] = Math.round(255 * y / (height - 1));
    data[i + 2] = 140;
    data[i + 3] = 255;
  }
}

const { image } = convert({ width, height, data }, {
  pixelSize: 8,
  colors: 16,
  dither: true,
});

console.log(image.width, image.height, image.data.length); // 96 64 24576
```

六包统一使用 `convert(image, options?)`。ASCII 包还返回可编辑的真实文本 `asciiText`，其文本与位图来自同一个字形网格。

## 输入、输出与边界

- 输入为 `{ width, height, data }`。宽高均为 1–512 的整数，`data` 必须是长度恰好为 `width * height * 4` 的 `Uint8Array` 或 `Uint8ClampedArray`。
- 可直接传入浏览器 Canvas 的 `ImageData`。算法先将透明像素合成到白色背景，不修改输入数组。
- 输出为 `{ image }`，其中 `image.data` 是新的不透明 RGBA `Uint8Array`。ASCII 返回 `{ image, asciiText }`，输出宽高由字符网格决定；其他风格保持输入尺寸。
- 包只处理已解码的像素。PNG/JPEG/WebP 解码、缩放、文件读写与编码由调用方负责。
- 每包只接受该风格的参数。未知字段、错误类型、NaN、Infinity 或越界值会抛出 `ImageConversionError`，错误码为 `invalid_request`。已知参数省略或设为 `undefined` 时采用默认值；不自动截断、修正或按 UI 滑杆步长取整。

## 六种算法

| 风格 | 实现 |
| --- | --- |
| ASCII | 单元格亮度映射到原创位图字形覆盖率，同步生成文本与 6 × 8 像素字符网格。 |
| 像素 | 方格平均色、有限色板 median-cut、可选 Floyd–Steinberg 网格抖动。 |
| 蓝晒 | 曝光、对比度与蓝白双色调查找表。 |
| Risograph | 两色或三色专色分色、聚集网点、叠印、套印偏移与固定种子颗粒。 |
| 波普 | 固定图形调色板、Sobel 轮廓与错列 Ben-Day 风格网点。 |
| 点彩 | 有界网格采样、保留采样色的圆点、固定种子位置偏移与纸色背景。 |

相同输入、参数与算法版本会得到相同输出。纹理使用显式 `seed`，不会调用模型或网络服务。导出的 `ALGORITHM_VERSION` 当前为 `'1'`，与 npm 包版本分别管理。

各包 README 列出了参数、默认值和效果边界；也可阅读[算法说明](./docs/algorithms.md)与[运行时接入示例](./docs/runtime.md)。

## 浏览器、Node 与 Cloudflare Workers

算法内核只使用 JavaScript 与 TypedArray。每包提供 ESM、CommonJS 和 TypeScript 声明；Cloudflare Workers 不需要为这些内核启用 Node 兼容选项。

512 像素边长上限用于限制内存与计算量，不代表所有效果都能满足任意 Workers 方案的 CPU 额度。部署时仍需控制请求大小、解码开销、并发和执行时间。浏览器 Canvas 与 Worker 的完整接入方式见[运行时指南](./docs/runtime.md)。

## 开发

```bash
npm ci
npm run build
npm run typecheck
npm test
```

`npm test` 运行单元、打包与 Worker 检查；`npm run pack` 将检查后的六个发布包生成到 `artifacts/`。

仓库中的通用辅助函数以共享源码维护，构建时只将需要的部分打入对应包。使用一个风格不需要安装其他五包。

## 许可证

[MIT](./LICENSE)。六种算法抽取自 Artgen 图片转换引擎；官网应用独立维护。
