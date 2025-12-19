# Docker 部署指南

## 构建 Docker 镜像

### 1. 构建镜像

在项目根目录下执行：

```bash
docker build -t kasusa/oil-assist:latest .
```

或者指定版本号：

```bash
docker build -t kasusa/oil-assist:v1.0.0 .
```

### 2. 测试本地运行

构建完成后，可以在本地测试运行：

```bash
docker run -d -p 3000:3000 --name oil-assist kasusa/oil-assist:latest
```

访问 http://localhost:3000 查看应用是否正常运行。

停止容器：

```bash
docker stop oil-assist
docker rm oil-assist
```

## 上传到 Docker Hub

### 1. 登录 Docker Hub

首先需要登录到 Docker Hub：

```bash
docker login
```

输入你的 Docker Hub 用户名（kasusa）和密码。

### 2. 标记镜像

确保镜像已经正确标记：

```bash
docker tag kasusa/oil-assist:latest kasusa/oil-assist:latest
```

或者标记为特定版本：

```bash
docker tag kasusa/oil-assist:latest kasusa/oil-assist:v1.0.0
```

### 3. 推送镜像

推送最新版本：

```bash
docker push kasusa/oil-assist:latest
```

推送特定版本：

```bash
docker push kasusa/oil-assist:v1.0.0
```

### 4. 验证

在 Docker Hub 上访问 https://hub.docker.com/r/kasusa/oil-assist 查看你的镜像。

## 使用 Docker 镜像

### 从 Docker Hub 拉取并运行

```bash
docker pull kasusa/oil-assist:latest
docker run -d -p 3000:3000 --name oil-assist kasusa/oil-assist:latest
```

### 持久化数据

数据库文件需要持久化存储，使用数据卷：

```bash
docker run -d -p 3000:3000 \
  -v oil-assist-data:/app \
  --name oil-assist \
  kasusa/oil-assist:latest
```

或者使用本地目录：

```bash
docker run -d -p 3000:3000 \
  -v $(pwd)/data:/app \
  --name oil-assist \
  kasusa/oil-assist:latest
```

### 查看日志

```bash
docker logs oil-assist
```

### 停止和删除容器

```bash
docker stop oil-assist
docker rm oil-assist
```

## 完整示例

### 构建并推送

```bash
# 1. 构建镜像
docker build -t kasusa/oil-assist:latest .

# 2. 测试运行
docker run -d -p 3000:3000 --name oil-assist-test kasusa/oil-assist:latest

# 3. 测试完成后停止
docker stop oil-assist-test
docker rm oil-assist-test

# 4. 登录 Docker Hub
docker login

# 5. 推送镜像
docker push kasusa/oil-assist:latest
```

## 注意事项

1. **数据持久化**：默认情况下，容器删除后数据会丢失。建议使用数据卷来持久化数据库文件。

2. **端口映射**：如果 3000 端口被占用，可以修改映射：
   ```bash
   docker run -d -p 8080:3000 --name oil-assist kasusa/oil-assist:latest
   ```
   然后访问 http://localhost:8080

3. **环境变量**：可以通过环境变量配置端口：
   ```bash
   docker run -d -p 3000:3000 \
     -e PORT=3000 \
     --name oil-assist \
     kasusa/oil-assist:latest
   ```

4. **更新镜像**：更新代码后，重新构建并推送：
   ```bash
   docker build -t kasusa/oil-assist:latest .
   docker push kasusa/oil-assist:latest
   ```

