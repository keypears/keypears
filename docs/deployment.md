# Webapp Deployment Guide

## 1. Containerize Your Webapp ✅ COMPLETED

The webapp has been successfully containerized using Docker with a multi-stage build process optimized for the pnpm monorepo structure.

### Building the Docker Image

From the monorepo root directory:

```bash
cd /path/to/keypears-com
docker buildx build -t keypears-webapp:latest .
```

The Dockerfile is located at the root of the monorepo (`/Dockerfile`) and handles:
- Building `@keypears/lib` package
- Building `@keypears/webapp` with React Router
- Installing production dependencies only in the final image
- Copying markdown content files for blog posts and static pages

### Testing the Docker Image Locally

Run the container:

```bash
docker run -d -p 4273:4273 --name keypears-app keypears-webapp:latest
```

Verify it's working:

```bash
# Check logs
docker logs keypears-app

# Test the homepage
curl http://localhost:4273

# Test the blog
curl http://localhost:4273/blog/

# Test other pages
curl http://localhost:4273/about
curl http://localhost:4273/privacy
curl http://localhost:4273/terms
```

Stop and remove the container:

```bash
docker stop keypears-app
docker rm keypears-app
```

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
