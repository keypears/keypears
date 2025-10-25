# Webapp Deployment Guide

## 1. Containerize Your Webapp ✅ COMPLETED

The webapp has been successfully containerized using Docker with a multi-stage
build process optimized for the pnpm monorepo structure.

### Building and Testing with pnpm Scripts (Recommended)

The easiest way to test the production webapp locally is using the pnpm scripts:

```bash
# Start the webapp container (builds and runs in background)
pnpm webapp:up

# View live logs
pnpm webapp:logs

# Stop and remove the container
pnpm webapp:down
```

These scripts use Docker Compose (configured in `docker-compose.yml` at the
monorepo root) to:

- Build the Docker image from `Dockerfile`
- Start the container with proper configuration
- Handle cleanup automatically

### Verifying the Webapp

Once started with `pnpm webapp:up`, test the endpoints:

```bash
# Test the homepage
curl http://keypears.localhost:4273

# Test the blog
curl http://keypears.localhost:4273/blog/

# Test other pages
curl http://keypears.localhost:4273/about
curl http://keypears.localhost:4273/privacy
curl http://keypears.localhost:4273/terms
```

### Manual Docker Commands (Alternative)

If you prefer to use Docker commands directly:

```bash
# Build the image
docker buildx build -t keypears-webapp:latest .

# Run the container
docker run -d -p 4273:4273 --name keypears-app keypears-webapp:latest

# Check logs
docker logs keypears-app

# Stop and remove
docker stop keypears-app
docker rm keypears-app
```

The Dockerfile is located at the root of the monorepo (`/Dockerfile`) and
handles:

- Building `@keypears/lib` package
- Building `@keypears/webapp` with React Router
- Installing production dependencies only in the final image
- Copying markdown content files for blog posts and static pages

### Environment Variables

The webapp server uses the following environment variables:

- `PORT` - Server port (default: 4273)
- `NODE_ENV` - Set to `production` in Docker (automatic)

## Deployment Checklist

- [ ] **2. Push Your Container Image to AWS ECR**
  - [ ] Create an ECR repository.
  - [ ] Authenticate Docker with ECR.
  - [ ] Tag the Docker image.
  - [ ] Push the image to ECR.

- [ ] **3. Set Up Your Network with AWS VPC**
  - [ ] Create a VPC.
  - [ ] Create at least two public subnets in different Availability Zones.
  - [ ] Create an Internet Gateway.
  - [ ] Configure route tables.

- [ ] **4. Configure AWS ECS and Fargate**
  - [ ] Create an ECS cluster.
  - [ ] Create a Fargate task definition.
  - [ ] Create an ECS service.

- [ ] **5. Configure a Load Balancer and SSL**
  - [ ] Request an SSL certificate from AWS Certificate Manager (ACM).
  - [ ] Create an Application Load Balancer (ALB).
  - [ ] Create a target group.
  - [ ] Configure listeners for HTTP (redirects to HTTPS) and HTTPS (forwards to
        the target group).

- [ ] **6. Configure DNS with AWS Route 53**
  - [ ] Create a hosted zone for your domain.
  - [ ] Create an alias 'A' record pointing your domain to the ALB.
