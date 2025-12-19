# GitHub Actions 配置说明

## 工作流文件

项目包含两个 GitHub Actions 工作流：

### 1. docker-publish.yml（完整版）
- 支持多标签（latest、分支名、版本号等）
- 支持 PR 时构建但不推送
- 支持版本标签自动发布

### 2. docker-publish-simple.yml（简化版）
- 只推送 latest 标签
- 更简单直接
- 支持手动触发

## 设置步骤

### 1. 在 GitHub 仓库中设置 Secrets

1. 进入你的 GitHub 仓库
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**
4. 添加以下两个 secrets：

   - **DOCKER_USERNAME**: `kasusa`
   - **DOCKER_PASSWORD**: 你的 Docker Hub 密码或访问令牌（Access Token）

### 2. 获取 Docker Hub 访问令牌（推荐）

使用访问令牌比直接使用密码更安全：

1. 登录 Docker Hub: https://hub.docker.com/
2. 点击右上角头像 → **Account Settings**
3. 选择 **Security** → **New Access Token**
4. 创建令牌并复制（只显示一次，请妥善保存）
5. 将令牌作为 `DOCKER_PASSWORD` secret 的值

### 3. 启用工作流

工作流会在以下情况自动触发：
- 推送到 `main` 或 `master` 分支
- 创建版本标签（如 `v1.0.0`）
- 手动触发（如果使用简化版）

## 使用方式

### 自动构建（推荐）

每次推送到主分支时，会自动构建并推送镜像：

```bash
git add .
git commit -m "Update code"
git push origin main
```

### 手动触发

如果使用简化版工作流，可以在 GitHub 上手动触发：

1. 进入 **Actions** 标签页
2. 选择 **Build and Push Docker Image (Simple)**
3. 点击 **Run workflow**

### 版本发布

创建版本标签会自动构建并推送带版本号的镜像：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 查看构建状态

1. 进入 GitHub 仓库的 **Actions** 标签页
2. 查看工作流运行状态
3. 点击运行记录查看详细日志

## 验证

构建成功后，可以在 Docker Hub 查看：
https://hub.docker.com/r/kasusa/oil-assist

## 拉取镜像

构建完成后，可以从 Docker Hub 拉取：

```bash
docker pull kasusa/oil-assist:latest
```

