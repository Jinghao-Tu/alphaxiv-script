# AlphaXiv / arXiv 切换油猴脚本设计

## 目标

制作一个油猴脚本，让同一篇论文能在以下三种阅读页面之间直接切换：

- `AlphaXiv`
- `arXiv abstract`
- `arXiv HTML`

脚本应在不同页面的自然位置插入切换入口，减少手动改 URL 的成本，并保持原站使用习惯。

## 范围

本次设计覆盖三类页面：

- `https://www.alphaxiv.org/abs/<paperId>`
- `https://arxiv.org/abs/<paperId>` 或 `https://www.arxiv.org/abs/<paperId>`
- `https://arxiv.org/html/<paperId>` 或 `https://www.arxiv.org/html/<paperId>`

其中 `<paperId>` 支持两类 arXiv ID：

- 新式数字 ID，如 `1706.03762`、`1706.03762v7`
- 旧式分类 ID，如 `cs/0112017`、`cs/0112017v1`

## 关键决定

### URL 规则

- `AlphaXiv` 链接始终使用基础论文 ID，不保留版本号。
- `arXiv abstract` 与 `arXiv HTML` 在当前页面带版本号时保留版本号。
- `arxiv.org` 与 `www.arxiv.org` 视为同一站点，脚本统一生成 `https://arxiv.org/...` 形式的目标链接。
- 对旧式分类 ID，脚本保留分类路径，只从最后一段剥离版本号。
- 对旧式分类 ID，不提供 `arXiv HTML` 入口，因为对应 HTML 页面在站点上返回 404。

为避免实现歧义，统一按下表处理：

| 源 URL | 解析结果 | AlphaXiv 目标 | arXiv Abs 目标 | arXiv HTML 目标 |
| --- | --- | --- | --- | --- |
| `https://arxiv.org/abs/1706.03762` | 基础 ID=`1706.03762`，无版本号 | `https://www.alphaxiv.org/abs/1706.03762` | 当前页 | `https://arxiv.org/html/1706.03762` |
| `https://arxiv.org/abs/1706.03762v7` | 基础 ID=`1706.03762`，版本=`v7` | `https://www.alphaxiv.org/abs/1706.03762` | 当前页 | `https://arxiv.org/html/1706.03762v7` |
| `https://arxiv.org/html/1706.03762` | 基础 ID=`1706.03762`，无版本号 | `https://www.alphaxiv.org/abs/1706.03762` | `https://arxiv.org/abs/1706.03762` | 当前页 |
| `https://arxiv.org/html/1706.03762v7` | 基础 ID=`1706.03762`，版本=`v7` | `https://www.alphaxiv.org/abs/1706.03762` | `https://arxiv.org/abs/1706.03762v7` | 当前页 |
| `https://www.alphaxiv.org/abs/1706.03762` | 基础 ID=`1706.03762`，无版本号 | 当前页 | `https://arxiv.org/abs/1706.03762` | `https://arxiv.org/html/1706.03762` |
| `https://www.alphaxiv.org/abs/cs/0112017` | 基础 ID=`cs/0112017`，无版本号 | 当前页 | `https://arxiv.org/abs/cs/0112017` | 不显示 |
| `https://arxiv.org/abs/cs/0112017v1` | 基础 ID=`cs/0112017`，版本=`v1` | `https://www.alphaxiv.org/abs/cs/0112017` | 当前页 | 不显示 |

### 当前态展示契约

为避免实现歧义，当前态展示按页面写死：

| 页面 | 是否显示当前态 | 形式 |
| --- | --- | --- |
| `AlphaXiv` | 否 | 仅显示跨站目标 |
| `arXiv abstract` | 是 | 在 `View on` 行中将 `Abstract` 渲染为纯文本，带 `aria-current="page"`，不带 `href` |
| `arXiv HTML` | 否 | 仅显示跨站目标 |

若目标在当前规则下不可用，如旧式分类 ID 的 `HTML` 目标，则直接省略该项，不渲染禁用占位。

### 实现路线

采用“单脚本 + 页面适配器模块”的方案。

对用户来说，最终交付是一个可直接安装的用户脚本。对维护者来说，脚本内部按职责分层，避免把 URL 规则、DOM 挂载点和样式逻辑混在一起。

## 架构

脚本内部拆为四层。

### 1. 环境识别层

职责：

- 判断当前页面属于 `AlphaXiv`、`arXiv abstract` 还是 `arXiv HTML`
- 从 URL 中解析基础论文 ID 和可选版本号

输出：

- 页面类型
- 基础论文 ID
- 原始版本号（若存在）
- 是否为旧式分类 ID

### 2. 链接构造层

职责：

- 根据统一规则构造目标页面链接
- 处理版本号保留与去除逻辑
- 对旧式分类 ID 隐藏 `HTML` 目标
- 根据当前页面类型决定哪些目标需要显示

输出：

- `AlphaXiv` 目标链接或空值
- `arXiv Abs` 目标链接或空值
- `arXiv HTML` 目标链接或空值

### 3. 页面适配层

为每种页面定义一个适配器。每个适配器只负责：

- 寻找挂载点
- 决定插入位置
- 决定使用按钮还是文本链接

公共链接逻辑不进入适配器，适配器也不重复实现 URL 解析。

### 4. 注入与容错层

职责：

- 页面加载后执行注入
- 挂载点尚未出现时等待目标节点出现
- 注入前检查唯一标记，避免重复插入

## 页面设计

### AlphaXiv 页面

位置：论文页面顶部操作条。

主挂载点：包含 `Paper`、`Blog`、`Resources` 三个入口的顶部操作行。

备选挂载点：若主挂载点不可用，则降级到包含 `Hide Tools` 文案的顶部工具容器。

锚点策略按以下优先级执行：

1. 查找同时包含 `Paper`、`Blog`、`Resources` 三个入口的顶部操作行。
2. 在该操作行内部，定位与下载按钮、计数按钮同级的操作容器。
3. 将脚本入口追加到该操作容器末尾。
4. 若步骤 1 到 3 失败，则查找包含 `Hide Tools` 文案的顶部工具容器，并追加到其末尾。
5. 若以上两条路径均失败，则判定本页无可用挂载点。

渲染项：

- 新式数字 ID：`arXiv Abs`、`arXiv HTML`
- 旧式分类 ID：仅 `arXiv Abs`

### arXiv abstract 页面

位置：`Access Paper` 区域新增一行。

锚点策略按以下优先级执行：

1. 查找标题文本为 `Access Paper:` 的区块。
2. 在该区块内定位现有链接列表，即包含 `View PDF`、`HTML (experimental)`、`TeX Source` 的列表。
3. 将新的 `View on` 行插入到该列表之后、`view license` 链接之前。
4. 若未同时找到标题区块和链接列表，则判定本页无可用挂载点。

推荐文案：

- 新式数字 ID：`View on: AlphaXiv | Abstract | HTML`
- 旧式分类 ID：`View on: AlphaXiv | Abstract`

保留原生 `HTML (experimental)` 入口，同时在新增的 `View on` 行中再次提供 `HTML`，这是有意保留的双入口：原生入口负责资源访问语义，新增入口负责统一的三视图切换语义。

### arXiv HTML 页面

位置：右上角 `Back to abstract page` 右侧。

锚点策略按以下优先级执行：

1. 查找页面顶部 banner 导航。
2. 在该导航内定位 `Back to abstract page` 链接。
3. 将 `AlphaXiv` 入口插入到该链接之后、`Download PDF` 之前。
4. 若未找到顶部导航或 `Back to abstract page`，则判定本页无可用挂载点。

渲染项：

- `AlphaXiv`

## 样式策略

- 优先复用原站链接或按钮观感。
- 仅补足轻量样式，保证入口可见、可点击、不过分突兀。
- 统一使用英文文案，与页面原语言保持一致。
- 插入元素带稳定的专属类名或属性，便于判重和测试断言。

## 容错与运行策略

### URL 不匹配

若当前 URL 不属于目标页面，脚本直接退出，不显示提示。

### 挂载点延迟处理

脚本按以下固定流程处理：

1. 页面脚本启动后立即尝试注入一次。
2. 若挂载点不存在，则启动 `MutationObserver` 监听文档变化。
3. 观察最长持续 5 秒。
4. 监听期间一旦成功注入，立即断开观察器。
5. 若 5 秒后仍未找到挂载点，则静默退出，不抛出可见错误。

### 重复注入

脚本在整个页面范围内只允许存在一个切换器实例。

具体规则如下：

1. 插入容器使用全页唯一标记。
2. 每次执行时先在整个文档中检查该标记。
3. 若已存在切换器，则本次执行直接退出，不再新增第二个实例。
4. 若首次因主挂载点缺失而插入到备选挂载点，则在该页面生命周期内保持原位，不迁移、不复制。

### 网络策略

脚本不主动请求远程接口验证链接可用性。保持实现简单、可预测、无额外依赖。

### 页面导航策略

本次设计仅支持整页加载场景，不处理站点内无整页刷新的客户端路由变化。若用户通过整页导航进入新论文页面，脚本会重新执行并完成注入。

## 测试策略

测试分为两层。

### 纯逻辑测试

验证：

- URL 解析是否正确
- 新式数字 ID 与旧式分类 ID 是否都能正确识别
- 版本号保留规则是否正确
- `arxiv.org` 与 `www.arxiv.org` 是否统一归一
- 旧式分类 ID 是否正确剥离版本号，并隐藏 `HTML` 目标

### 页面验证示例

使用以下示例页面进行手工验证：

- `https://www.alphaxiv.org/abs/1706.03762`
- `https://www.arxiv.org/abs/1706.03762`
- `https://www.arxiv.org/html/1706.03762`
- `https://www.arxiv.org/abs/1706.03762v7`
- `https://www.arxiv.org/html/1706.03762v7`
- `https://www.alphaxiv.org/abs/cs/0112017`
- `https://www.arxiv.org/abs/cs/0112017v1`

### 验收点

- `AlphaXiv` 左上操作区是否出现正确数量的切换入口
- `arXiv abstract` 的 `Access Paper` 区域是否新增 `View on` 一行
- `arXiv HTML` 右上是否在 `Back to abstract page` 右侧出现 `AlphaXiv`
- 带版本号的 `abs/html` 页面生成的目标 URL 是否继续保留版本号
- 旧式分类 ID 页面是否省略 `HTML` 入口
- 同一页面再次执行脚本时是否仍只存在一个切换器
- 当主挂载点不可用时，是否按设计降级到备选挂载点
- 5 秒超时后是否静默退出，不抛出可见错误

### 自动化 DOM fixture 覆盖

若需要自动化 DOM 验证，测试应使用最小 HTML fixture 覆盖以下场景：

- 主挂载点存在
- 主挂载点缺失，仅备选挂载点存在
- 主挂载点与备选挂载点都缺失
- 已插入备选挂载点后再次执行脚本
- 新式数字 ID 页面带版本号
- 旧式分类 ID 页面省略 `HTML` 入口

## 交付物

推荐交付：

- 一个可直接安装的用户脚本文件
- 一个简短的 `README`
- 如有需要，一个轻量的逻辑测试文件

不引入打包器，不引入框架，不为简单切换功能增加不必要的工程复杂度。

## 暂不包含

以下内容暂不纳入本次设计：

- PDF 页面切换入口
- 额外快捷键支持
- 页面可用性网络探测
- 站点内客户端路由切换支持
- 与论文管理、收藏、笔记等功能的集成

本次只解决“同一论文在 AlphaXiv、arXiv abstract、arXiv HTML 之间快速切换”这一件事，并把这件事做好。
