# ARM64 NAS 部署（custom-wall-display）

本分支仅修改 Wall Display，保留原有周视图网格与侧栏。隐藏“日”导航，旧的日视图默认值在浏览器中回退到周视图；切换月、周、日程时回到今天。界面使用简体中文、24 小时制日期时间，日期按显示设备的本地时区计算。

周格按到期日显示一次性家务，重复家务按开始日期和星期显示；未设日期的家务仅显示在今天。所有日期的家务均可双击修改，单击不修改；双击后必须在确认窗口中核对日期、家务名称及操作并确认。触屏支持两次快速点按，键盘激活也需确认。原有清单查看权限仍有效。完成操作使用现有 `/api/items/:id/complete`，提交 `{done, day}`，重复家务每一天独立记录。家务展示遵循 Wall Display 的 `showChores` 设置及清单显示设置。后端读取接口补充返回所查询日期到期的已完成家务，避免历史完成记录因七天窗口被隐藏；无数据库结构修改。

## 首次测试部署：独立数据库与端口

在支持 Docker Compose 的 ARM64 NAS 终端执行，`uname -m` 应显示 `aarch64` 或 `arm64`。本地 Windows 的 Docker 服务未运行，本次未实际构建或启动 ARM64 容器。

```sh
git clone --branch custom-wall-display https://github.com/simaodangan/hearth-calendar.git hearth-wall-test
cd hearth-wall-test
cp .env.example .env
mkdir -p backups
```

编辑 `.env`：用两次 `openssl rand -hex 32` 分别生成新的 `APP_SECRET` 与 `POSTGRES_PASSWORD`，设置 `BASE_URL=http://NAS局域网IP:18080`、`APP_PORT=18080`、`DEFAULT_TIMEZONE=Asia/Shanghai`。显示设备也设置中国时区。不要复制生产账号同步配置或生产数据库。保留 `ALLOW_SIGNUP=false`；原项目允许首个账号注册成为管理员。

```sh
docker compose -p hearth-wall-test -f docker-compose.yml -f docker-compose.wall-display.yml config --quiet
docker compose -p hearth-wall-test -f docker-compose.yml -f docker-compose.wall-display.yml build app
docker compose -p hearth-wall-test -f docker-compose.yml -f docker-compose.wall-display.yml up -d db app backup
docker compose -p hearth-wall-test -f docker-compose.yml -f docker-compose.wall-display.yml ps
curl -f http://127.0.0.1:18080/healthz
docker image inspect hearth-calendar:custom-wall-display --format '{{.Architecture}}'
```

最后一条应输出 `arm64`。此覆盖文件使用本地自定义镜像，避免启动上游发布的原版镜像。Compose 项目名 `hearth-wall-test` 使数据库卷独立于默认 `hearth` 项目。测试目录也使备份独立。不要设置指向生产数据库的 `DATABASE_URL`，不要挂载现有生产数据库卷。

在 `http://NAS局域网IP:18080` 创建测试账号、测试成员、日历与家务，在设置 → Wall displays 创建显示链接，用测试数据验证：七个日期格不变；只有今天可勾选与取消；其他日期只读；只读清单不可修改；切换月、周、日程回今天；界面与日期为中文。此分支只本地修改显示页面的默认视图，不更改服务器保存的显示设置。

## 已有 NAS 实例的后续升级

本次没有执行生产升级。升级前备份数据库、原 `.env` 和当前镜像标识，并验证备份可以恢复。先在上述独立测试实例确认结果，再在现有部署目录切换本分支，保持原 Compose 项目名、数据卷和 `.env`。构建镜像后，仅重建 app 服务：

```sh
docker compose -p YOUR_EXISTING_PROJECT -f docker-compose.yml -f docker-compose.wall-display.yml build app
docker compose -p YOUR_EXISTING_PROJECT -f docker-compose.yml -f docker-compose.wall-display.yml up -d --no-deps app
```

将 `YOUR_EXISTING_PROJECT` 替换为现有项目名。应用启动会执行项目原有迁移机制，应先审查从当前部署版本到此分支的差异。本分支没有新增迁移。回退时使用保存的原镜像和原 Compose 配置重建 app 服务；不要执行 `down -v`。

## 本次验证

最新显示调整：普通新建日程默认全天，已有日程、带时间的草稿和日视图时间格保留指定时间。周格日程只显示标题，隐藏时间、全天标签和成员图标，统一使用深灰蓝色（若与成员颜色重合则选用另一中性色）。日程详情中仍可查看时间。周格家务将姓名图标和完成状态图标上下排在同一窄列，保留标题宽度与各日横行对齐。

后续界面调整：周格家务沿用右侧成员颜色（未分配使用默认颜色），家务靠底、日程靠顶，星期字号大于日期。“今日家务”标题旁提供“编辑”链接，跳转至 `/#chores`；看板中的家务项目不再打开编辑器。勾选不会按完成状态重新排序。周格不显示“家务”小标题，同一项家务在各日期保留同一横行，未安排的日期留空；行高统一为 64px，长名称显示两行并提供完整名称提示。日程区独立滚动，家务超出可见区域时七列同步滚动以保持横向对齐。编辑器展示重复家务的星期选择，点击任何一天自动切换为指定星期；切换“每天”或“工作日”时同步按钮状态，避免预设与实际选择不一致。

更新版已成功构建本机 Docker 镜像 `hearth-wall-test:custom-wall-display`，未启动或重建任何现有容器。该构建验证本机架构，不代表 ARM64 镜像已经验证。用本机覆盖配置切换独立测试实例：

```sh
docker compose -p hearth-wall-test -f docker-compose.yml -f docker-compose.local-wall-display.yml build app
docker compose -p hearth-wall-test -f docker-compose.yml -f docker-compose.local-wall-display.yml up -d --no-deps --pull never app
```

数据库容器需已经运行。这两条命令只构建、重建测试 app；数据库卷保留。编辑现有家务并保存一次，以使选中的星期生效。

`node --test app/tests/display.test.js` 检查视图回退、到期日与重复规则、跨月逐日完成状态、中文日期与主应用语言隔离。浏览器模拟接口检查七个日期格、今天可编辑、其他日期只读、权限、完成/取消、失败回滚、视图切换回今天与无前端异常。未连接生产服务，未写入真实家务、日历或账号。项目没有前端编译脚本，静态页面直接由 Node 服务提供；ARM64 Docker 构建须在 NAS 上完成。
