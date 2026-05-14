<div align="center">

# CV-DDL

计算机视觉顶会、挑战赛与 workshop 截止日追踪。

[![GitHub Pages](https://img.shields.io/badge/Pages-live-06B6D4?style=for-the-badge)](https://just-agent.github.io/cv-ddl/)
[![Data Check](https://img.shields.io/badge/Data-checks-059669?style=for-the-badge)](https://github.com/Just-Agent/cv-ddl/actions)
[![Just-DDL](https://img.shields.io/badge/Just--DDL-network-101626?style=for-the-badge)](https://just-agent.github.io/just-ddl/)

[专题页面](https://just-agent.github.io/cv-ddl/) · [Just-DDL Hub](https://just-agent.github.io/just-ddl/#/topic/cv-ddl) · [GitHub 仓库](https://github.com/Just-Agent/cv-ddl)

</div>

## Production Data Flow

本仓库已从内置 demo 数据升级为数据优先结构：

| 文件 | 作用 |
| --- | --- |
| `data/items.json` | DDL 条目数据，页面直接读取 |
| `data/sources.json` | crawler seed 来源清单 |
| `scripts/validate-data.mjs` | 校验必填字段、日期、状态、URL |
| `scripts/link-check.mjs` | 检查来源链接可访问性，默认 warning-only |
| `scripts/crawl-sources.mjs` | 输出 crawler seed plan，后续接具体解析器 |
| `.github/workflows/data-check.yml` | 数据变更、PR、定时任务自动校验 |

## 下一步

- 为每个 source 编写 parser module
- crawler 输出标准 `data/items.json`
- 增加 `verified_at`、`source_priority`、`deadline_timezone`
- 在 Just-DDL Hub 展示更新时间与数据健康状态

## References

- AllConfs: https://www.allconfs.org/
- SinoConf: https://sinoconf.napstic.cn/index
- CompeteHub: https://www.competehub.dev/zh

## License

当前仓库处于产品孵化阶段。正式开源协议会在发布稳定版本前补齐。
