# 数形万变 FunJSON v0.1.0

首个正式版本：离线 JSON 与多格式数据处理工作台。

## 主要功能

- **多视图工作台**：文本（CodeMirror 6）、树形、栏列（Miller Columns）、表格（筛选/排序/CSV·TSV·Markdown 导出）与差异对比（支持语义对比）五大视图一键切换；
- **多格式识别与编辑**：自动识别并高亮 JSON / JSONC / JSON5 / YAML / TOML / XML / CSV / TSV / INI / NDJSON / SQL / Protobuf / HTML / CSS / JS / TS / Markdown，支持缩进自动识别与多标签页及历史版本回溯；
- **JSONPath 查询 & 智能解码**：内置 RFC 9535 JSONPath 实时查询栏，支持时间戳、Base64、URL、Unicode、内嵌 JSON 字符串与颜色值即时识别与预览；
- **8 合 1 工具箱**：JSON 修复（本地 `jsonrepair` + 可选 AI 修复）、对象类型转换（TS/Go/Java/Rust/Python/Kotlin/Swift/C#/JSON Schema）、多格式互转、JSONPath 筛选、Key 命名转换、编码/时间戳转换、JWT 解析与 HMAC 验签、Protobuf 字段重新编号；
- **AI / MCP 工具**：提供 `format_json`、`query_jsonpath`、`convert_data_format`、`json_to_types`、`decode_jwt`。
