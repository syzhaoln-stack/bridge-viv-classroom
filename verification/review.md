# 浏览器实时涡振：独立数值核验

选定课堂配置为 D = 8 格、参考格子速度 0.07、fn = 0.18、m* = 10、ζ = 0.01，用户风速范围 U = 0.5–1.5。程序在设备上推进真实 D2Q9 流体与单自由度结构状态，升力来自流场动量交换；没有读取下面的校准记录来驱动页面，也没有施加预定正弦升力或按目标振幅缩放结果。

## 实际计算结果

沿同一流场完成：U = 0.6 持速 180 时间单位；用 60 时间单位升至 1.0；持速 100；再用 60 时间单位升至 1.5；持速 100。时间统一采用 D/Uref，改变风速不会改变结构频率的标度。取各持速段最后约 60 时间单位，独立减均值、线性去趋势、Hann 窗和未补零 FFT 得到：

| 风速 U/Uref | 位移半峰峰值 A/D | 升力主频 fnondim | 尾流探针主频 fnondim |
|---|---:|---:|---:|
| 0.6 | 0.00529 | 0.08337 | 0.08337 |
| 1.0 | 0.35322 | 0.18342 | 0.18342 |
| 1.5 | 0.05273 | 0.28346 | 0.28346 |

结构固有频率为 0.18，频谱真实分辨率约 0.0167。结果支持这个有限时间实验中“频率接近时振幅放大，再远离时减小”。它不确定完整锁定区边界，也不代表工程收敛后的幅值。扫速阶段本身是非平稳信号，不被当作稳态响应曲线。

在近频持速末态复制全部流体与结构状态，再分别运行 80 时间单位：ζ = 0.01 的后 40 时间单位 A/D = 0.35327，ζ = 0.08 为 0.15552，观测比值为 0.4402。对应 Sc 分别为 0.987 与 7.896。这里没有以“必须减振”作为通过断言，也没有缩小升力；事实上两支升力脉动 RMS 分别为 0.1131 和 0.3500。

主轨迹及阻尼分支合计 75,429 个真实流体步，本机此次约 98 秒。按约每 10 时间单位进行的流场诊断中，最大相对 Mach 数为 0.29445；这不是每一步所有参数组合的上界。手机实际速度取决于设备，页面显示实测推进速度。

原始记录：[`calibration-balanced.json`](calibration-balanced.json)。独立结果：[`calibration-balanced-analysis.json`](calibration-balanced-analysis.json)。独立分析仅在末尾样本块较短时略去该点以保持 FFT 等间隔，未插值时程或补造样本；原始记录完整保留。

## 一致性与状态切换

- 最终生产核心的 200 步与原 Python 求解器在相同初始分布和控制参数下对照：分布函数与受力最大差为 0，结构状态最大差 1.08×10⁻¹⁹。见 [`port-reference-python-comparison.json`](port-reference-python-comparison.json)。
- 参数变化保留流场、位移、速度和时间；质量、刚度、阻尼与 Sc 的换算相符，参数变化后的端点加速度按当前流体力重算。固定锁住当前位移；释放保持当前位置。见 [`core-checks.json`](core-checks.json)。
- 隔离生产中点结构推进器，20 周期零阻尼最终/初始能量比为 1 + 5.8×10⁻¹⁵；输入 ζ = 0.01、0.05，分别测得 0.00999985、0.04999919。流体力在此隔离检查中为零，未替换结构积分公式。
- 从已发展近频流场、y/D = 0.33365 且 v/Uref = 0.13078 时锁定：结构没有位置跳变，全部流体实验室横速的同刻显示差为 0；随后固定 350 步再释放，诊断密度保持有限，振动恢复。见 [`mature-fixed-balanced-check.json`](mature-fixed-balanced-check.json)。
- 生产测频函数已改为全频非零 FFT 主峰，报告真实窗口分辨率；纯趋势、弱信号及短窗不报频率。合成 1.72 高频如实被识别，不会强行挑选 fn 附近的峰。实际时程也已直接送入该函数检查。见 [`frequency-check.json`](frequency-check.json)。

## 被排除的数值设置

不能只看位移曲线是否符合预期。参考格子速度 0.06 虽降低 Mach 数，却使松弛时间更接近 0.5；长程近频升力出现约 1.72 的强高频峰，且位移仍像在正常共振。该未解释高频污染不接受为默认课堂配置，也未通过删去高频或改选低频峰来掩盖。证据保存在 [`calibration-lowmach-analysis.json`](calibration-lowmach-analysis.json)。其通用 `passed` 字段只表示完整、有限、单调时程，**不表示科学审核接受该配置**。

0.08 的趋势正确，但高速诊断局部 Mach 数约 0.338，保留作数值敏感性对照：[`calibration-analysis.json`](calibration-analysis.json)。选用 0.07 并把用户风速上限设为 1.5 后，上述真实协议同时保留清楚的频率/幅值变化和较低局部 Mach。不同设置幅值仍存在差异，说明尚不能作定量工程预测。

## 版本和方法限制

最终核心 SHA-256 为 `3088a8be07a0588a1cc7b84fd3e842b9b703bdc54f888a1885c64568e8f74588`。长程和成熟锁定检查运行于 `ee2158bce5b1d52eae5956e1333f032c5d43ead0db093a42af4c62b29656feb0`；对最终文件仅逆向替换默认参考速度 0.07→0.06 及风速边界 1.5→1.6 后，其 SHA 与长程版本完全一致。因此显式设置 0.07、仅使用 U≤1.5 的长程数值算法未改变，最终短程检查则直接使用最终文件。

该模式是整体附体坐标、横向周期边界和粗半格反弹，不是局部 ALE 动网格；圆柱附近 Cp 使用粗外流体节点取样，不是解析壁面压强。流固耦合为旧力保持一步的显式分区法。以上是实现一致性和有限时间现象检查，没有完成网格/时间步/计算域收敛验证。公式与方法来源见 [`method-review.md`](method-review.md)。

## 复现

在课程工作区根目录运行：

```text
node advanced-wind-course/viv/browser-qa/check-core.cjs
python -X utf8 advanced-wind-course/viv/browser-qa/compare-python.py advanced-wind-course/viv/browser-qa/port-reference.json
node advanced-wind-course/viv/browser-qa/calibrate.cjs 0.07 0.18 calibration-balanced
python -X utf8 advanced-wind-course/viv/browser-qa/analyze-history.py advanced-wind-course/viv/browser-qa/calibration-balanced.json
node advanced-wind-course/viv/browser-qa/check-mature-fixed.cjs 0.07 mature-fixed-balanced-check.json
node advanced-wind-course/viv/browser-qa/check-frequency.cjs
```

Node 运行生产核心；Python 仅用于离线独立核验，不是手机页面运行依赖。
