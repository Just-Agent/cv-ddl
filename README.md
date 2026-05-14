<div align="center">

# CV-DDL

计算机视觉顶会、挑战赛与 workshop 截止日追踪。

[![GitHub Pages](https://img.shields.io/badge/Pages-live-06B6D4?style=for-the-badge)](https://just-agent.github.io/cv-ddl/)
[![Just-DDL](https://img.shields.io/badge/Just--DDL-network-101626?style=for-the-badge)](https://just-agent.github.io/just-ddl/)
[![Status](https://img.shields.io/badge/Demo-completed-059669?style=for-the-badge)](https://just-agent.github.io/cv-ddl/)

[专题页面](https://just-agent.github.io/cv-ddl/) · [Just-DDL Hub](https://just-agent.github.io/just-ddl/#/topic/cv-ddl) · [GitHub 仓库](https://github.com/Just-Agent/cv-ddl)

</div>

## Demo 已完善

这个仓库不再只是空 Pages 骨架。当前已经包含完整 demo DDL 列表、搜索筛选、状态统计、来源说明和统一 Just-DDL Network 导航。数据风格参考 AllConfs 的会议列表结构，以及 SinoConf 的国内会议/预告/回顾入口。

## Demo DDL Seed

| DDL | 阶段 | 截止日 | 地点 | 来源类型 |
| --- | --- | --- | --- | --- |
| CVPR 2027 Abstract Registration | Abstract | 2026-11-07 | Online | AllConfs-style seed |
| CVPR 2027 Full Paper | Full paper | 2026-11-14 | Online | Demo seed |
| ICCV 2027 Paper Submission | Paper | 2027-03-17 | Online | Demo seed |
| ECCV 2026 Camera Ready | Camera ready | 2026-07-20 | Online | Official-style seed |
| WACV 2027 First Round | Round 1 | 2026-07-14 | Online | Demo seed |
| MICCAI 2027 Full Paper | Paper | 2026-12-15 | Online | Demo seed |
| Image Matching Challenge 2026 | Leaderboard | 2026-08-01 | Online | Kaggle-style demo |
| Video Object Segmentation Challenge | Final submit | 2026-10-18 | Online | Benchmark demo |

## 后续生产化

| 模块 | 当前 | 下一步 |
| --- | --- | --- |
| 页面 | 完整 demo 页面已上线 | 替换为真实数据源输出 |
| 数据 | seed 数据在 index.html 内置 | 拆出 JSON/YAML schema |
| Actions | Pages 自动部署 | 增加 crawler、validator、link-check |
| Hub 联动 | 已接入 Just-DDL Hub | 加入更新时间和数据健康状态 |
| 小程序 | 结构已预留 | 复用同一 schema 输出小程序专题页 |

## References

- AllConfs: https://www.allconfs.org/
- SinoConf: https://sinoconf.napstic.cn/index

## License

当前仓库处于产品孵化阶段。正式开源协议会在发布稳定版本前补齐。