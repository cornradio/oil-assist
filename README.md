# 油耗记录系统

油耗助手，可以记录油耗、其他花费以及按照公里数提醒维保。

<img width="1503" height="4319" alt="oil-assist" src="https://github.com/user-attachments/assets/190212b9-d1dc-484a-92ec-8c0d3a1fd6a8" />


## 功能特点

- ✅ **车辆管理**：支持多车辆管理，每辆车独立记录
- ✅ **里程管理**：添加车辆时记录当前里程数
- ✅ **加油记录**：记录每次加油的升数、价格和里程数
- ✅ **统计分析**：自动计算平均油耗、总费用等统计信息
- ✅ **图表展示**：可视化展示油耗趋势、费用和油价变化
- ✅ **响应式设计**：完美支持手机和电脑访问

部署方式分成 node 源码部署、docker 部署。

## node 部署

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器将在 `http://localhost:3000` 启动

## Docker 部署

如果你偏好使用 Docker，可以通过以下方式快速运行：

### 1. 直接运行（使用 Docker Hub 镜像）

可选，使用tar包加载docker
```
load -i oil-assist-20260108-215255.tar
```

```bash
docker run -d -p 3088:3000 \
  -v oil-assist-data:/app \
  --name oil-assist \
  kasusa/oil-assist:latest
```

### 2. 本地构建并运行

```bash
# 构建镜像
docker build -t oil-assist .

# 运行容器 (数据持久化)
docker run -d -p 3088:3000 \
  -v $(pwd)/data:/app \
  --name oil-assist \
  oil-assist
```

### 3. 使用自动化脚本 (Windows)

项目中包含一个 PowerShell 脚本，可以自动化构建、推送和打包流程：

```powershell
.\docker-build-push.ps1
```

> **注意**：为了保证数据不丢失，建议始终使用 `-v` 参数挂载数据卷或本地目录来存储数据库文件 `oil_assist.db`。

## 使用方法

### 添加车辆

1. 点击"添加车辆"按钮
2. 输入车辆名称（例如：我的车）
3. 输入当前里程数（公里）
4. 点击"添加"完成

### 记录加油信息

1. 选择要记录的车辆
2. 点击"添加加油记录"按钮
3. 填写以下信息：
   - **加油升数**：本次加油的升数（L）
   - **价格**：本次加油的总费用（元）
   - **里程数**：加油时的里程数（公里）
4. 点击"添加"完成

### 查看统计

选择车辆后，系统会自动显示：
- 加油次数、总加油量、总费用
- 平均单价、总里程、平均油耗
- 三个图表：
  - **油耗趋势图**：显示每次加油后的油耗变化
  - **加油费用图**：显示每次加油的费用
  - **油价趋势图**：显示每次加油的单价变化

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite
- **前端**：HTML5 + CSS3 + JavaScript
- **图表库**：Chart.js

## 项目结构

```
oil-assist/
├── server.js          # Express 服务器
├── database.js        # 数据库操作
├── package.json       # 项目配置
├── public/            # 静态文件
│   ├── index.html     # 主页面
│   ├── css/
│   │   └── style.css  # 样式文件
│   └── js/
│       └── app.js     # 前端逻辑
└── README.md          # 说明文档
```

## 注意事项

- 数据库文件 `oil_assist.db` 会在首次运行时自动创建
- 删除车辆会同时删除该车辆的所有加油记录
- 需要至少2条加油记录才能显示图表统计
- 油耗计算基于相邻两次加油的里程差

## 许可证

MIT


