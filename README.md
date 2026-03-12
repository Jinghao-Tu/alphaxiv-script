# AlphaXiv / arXiv Switcher

一个 Tampermonkey userscript，用于在同一篇论文的以下页面之间快速切换：

- AlphaXiv
- arXiv Abstract
- arXiv HTML

脚本会在各站点页面的自然位置插入切换入口，减少手动改 URL 的成本。

## 脚本作用

- 在 `AlphaXiv` 页面添加跳转到 `arXiv Abs`、`arXiv HTML` 的入口
- 在 `arXiv abstract` 页面添加统一的 `View on:` 切换行
- 在 `arXiv HTML` 页面添加跳转到 `AlphaXiv` 的入口
- 对带版本号的 arXiv 页面保留版本号
- 对旧式分类 ID（如 `cs/0112017`）自动省略不存在的 `HTML` 入口

## 支持页面类型

- `https://www.alphaxiv.org/abs/<paperId>`
- `https://arxiv.org/abs/<paperId>`
- `https://www.arxiv.org/abs/<paperId>`
- `https://arxiv.org/html/<paperId>`
- `https://www.arxiv.org/html/<paperId>`

其中 `<paperId>` 支持：

- 新式 ID：`1706.03762`、`1706.03762v7`
- 旧式分类 ID：`cs/0112017`、`cs/0112017v1`

## Tampermonkey 安装方式

1. 在浏览器中安装 Tampermonkey。
2. 运行构建命令，生成最新的 userscript：

   ```bash
   npm run build
   ```

3. 打开 Tampermonkey 管理面板。
4. 通过以下任一方式安装 `dist/alphaxiv-arxiv-switcher.user.js`：
   - 新建脚本后粘贴文件内容
   - 使用导入功能导入该文件
   - 直接在浏览器中打开该文件并交给 Tampermonkey 安装
5. 确认脚本已启用，然后访问支持页面进行验证。

## 如何运行测试

```bash
npm test
```

## 如何重新构建 userscript

```bash
npm run build
```

构建产物会写入：

- `dist/alphaxiv-arxiv-switcher.user.js`

## 开发时推荐的最终验证

```bash
npm run build && npm test
```

## 手工验证 URL 列表

### 新式 ID

- `https://www.alphaxiv.org/abs/1706.03762`
  - 预期显示：`arXiv Abs`、`arXiv HTML`
- `https://www.arxiv.org/abs/1706.03762`
  - 预期显示：`View on: AlphaXiv | Abstract | HTML`
- `https://www.arxiv.org/html/1706.03762`
  - 预期在 `Back to abstract page` 后、`Download PDF` 前显示：`AlphaXiv`
- `https://www.arxiv.org/abs/1706.03762v7`
  - 预期保留 `v7`
- `https://www.arxiv.org/html/1706.03762v7`
  - 预期保留 `v7`

### 旧式分类 ID

- `https://www.alphaxiv.org/abs/cs/0112017`
  - 预期省略：`HTML`
- `https://www.arxiv.org/abs/cs/0112017v1`
  - 预期省略：`HTML`

## 目录说明

- `src/switcher.mjs`：脚本核心逻辑
- `scripts/build-userscript.mjs`：构建脚本
- `dist/alphaxiv-arxiv-switcher.user.js`：可安装的 userscript 产物
- `tests/switcher.test.mjs`：URL 逻辑、DOM 适配和构建烟雾测试
