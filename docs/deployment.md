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

## 2. Push Your Container Image to AWS ECR ✅ COMPLETED

### Prerequisites

- [x] AWS CLI installed (`brew install awscli`)
- [x] AWS credentials configured with administrator access
- [x] Docker installed and running

### Create ECR Repository

- [x] Go to AWS Console → ECR → Repositories
- [x] Click "Create repository"
- [x] Name: `keypears-webapp`
- [x] Region: `us-east-1`
- [x] Keep other settings as default
- [x] Click "Create repository"

### Deploy to ECR with pnpm Scripts

The easiest way to build and push to ECR:

```bash
# Build, tag, and push to ECR
pnpm deploy:build
```

This command will:

1. Authenticate Docker with ECR
2. Build the Docker image (for linux/amd64 platform)
3. Tag the image for ECR
4. Push to ECR
5. Verify the push succeeded

### Individual Deployment Commands

If you prefer to run steps individually:

```bash
# 1. Authenticate Docker with ECR (token valid for 12 hours)
pnpm deploy:login

# 2. Build the Docker image
pnpm build:webapp

# 3. Tag the image for ECR
pnpm deploy:tag

# 4. Push to ECR
pnpm deploy:push

# 5. Verify the image was pushed
pnpm deploy:verify
```

**Note**: The ECR authentication token expires after 12 hours. If you get a
"push access denied" error, run `pnpm deploy:login` again.

Your image is now available at:
`299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears-webapp:latest`

## 3. Set Up Your Network with AWS VPC

### Create VPC

- [x] Go to AWS Console → VPC → Your VPCs
- [x] Click "Create VPC"
- [x] Choose "VPC and more" (creates subnets, IGW, route tables automatically)
- [x] Settings:
  - Name: `keypears-vpc`
  - IPv4 CIDR: `10.0.0.0/16`
  - IPv6: No IPv6 CIDR block
  - Tenancy: Default
  - Number of AZs: 2
  - Number of public subnets: 2
  - Number of private subnets: 0
  - NAT gateways: None
  - VPC endpoints: None
- [x] Click "Create VPC"

This creates:

- VPC with CIDR `10.0.0.0/16`
- Two public subnets in different AZs (e.g., `10.0.0.0/24`, `10.0.1.0/24`)
- Internet Gateway attached to VPC
- Route table with route to Internet Gateway

### Verify Network Configuration

- [x] Go to VPC → Subnets
- [x] Confirm you have 2 public subnets in different Availability Zones
- [x] Go to VPC → Internet Gateways
- [x] Confirm Internet Gateway is attached to `keypears-vpc`
- [x] Go to VPC → Route Tables
- [x] Confirm public route table has route `0.0.0.0/0` → Internet Gateway

## 4. Configure AWS ECS and Fargate

### Create ECS Cluster

- [x] Go to AWS Console → ECS → Clusters
- [x] Click "Create cluster"
- [x] Settings:
  - Cluster name: `keypears-cluster`
  - Infrastructure: AWS Fargate (serverless)
  - Monitoring: Enable Container Insights (optional, adds costs)
- [x] Click "Create"

### Create Task Definition

- [ ] Go to ECS → Task Definitions
- [ ] Click "Create new task definition"
- [ ] Click "Create new task definition" (JSON tab)
- [ ] Paste this JSON configuration:

```json
{
  "family": "keypears-webapp-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "1024",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "keypears-webapp",
      "image": "299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears-webapp:latest",
      "cpu": 256,
      "memory": 1024,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 4273,
          "protocol": "tcp",
          "name": "keypears-webapp-4273-tcp",
          "appProtocol": "http"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "4273"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/keypears-webapp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "executionRoleArn": "arn:aws:iam::299190761597:role/ecsTaskExecutionRole"
}
```

- [x] Click "Create"

**Note**: If you don't have `ecsTaskExecutionRole`, create it:

- [x] Go to IAM → Roles → Create role
- [x] Trusted entity: AWS service → Elastic Container Service → Elastic
      Container Service Task
- [x] Attach policy: `AmazonECSTaskExecutionRolePolicy`
- [x] Name: `ecsTaskExecutionRole`
- [x] Create role

### Create ECS Service

- [x] Go to ECS → Clusters → `keypears-cluster`
- [x] Click "Services" tab → "Create"
- [x] Settings:
  - **Compute options**: Launch type → Fargate
  - **Task definition**: `keypears-webapp-task` (latest)
  - **Service name**: `keypears-webapp-service`
  - **Desired tasks**: `1` (ensures always 1 container running, no cold starts)
- [x] **Networking**:
  - VPC: `keypears-vpc`
  - Subnets: Select both public subnets
  - Security group: Create new security group
    - Name: `keypears-webapp-sg`
    - Inbound rules:
      - Type: Custom TCP
      - Port: 4273
      - Source: Custom → `0.0.0.0/0` (temporary, will be updated to ALB SG after
        creation)
      - Description: "Allow traffic from ALB"
  - Public IP: ENABLED (required for Fargate in public subnets)
- [x] **Load balancing**: Application Load Balancer
  - Create new load balancer: `keypears-alb`
  - Listener: HTTP port 80 (HTTPS will be added in Section 5)
  - Target group: Create new
    - Name: `keypears-tg`
    - Protocol: HTTP
    - Port: 4273
    - Health check path: `/`
- [x] Click "Create"

**Note**: We're starting with HTTP only. SSL/HTTPS will be configured in Section
5 after the service is running.

**Important**: After service is created, update the security group:

- [x] First, find the ALB security group ID:
  - Go to EC2 → Security Groups
  - Find the security group starting with `keypears-alb-` (auto-created)
  - Copy its Security Group ID (format: `sg-xxxxxxxxx`)
- [x] Update container security group:
  - Go to EC2 → Security Groups → `keypears-webapp-sg`
  - Edit inbound rules
  - Delete the existing port 4273 rule (with source `0.0.0.0/0`)
  - Add new rule:
    - Type: Custom TCP
    - Port: 4273
    - Source: Custom → paste the ALB security group ID
    - Select it from the dropdown (AWS will auto-suggest)
    - Description: "Allow traffic from ALB"
  - Save rules

### Auto-Scaling (Optional)

If you want to scale up during high traffic (while keeping minimum at 1):

- [x] Go to ECS → Clusters → `keypears-cluster` → Services →
      `keypears-webapp-service`
- [x] Click "Auto Scaling" tab → "Create"
- [x] Settings:
  - Minimum tasks: `1`
  - Desired tasks: `1`
  - Maximum tasks: `10`
  - Scaling policy: Target tracking
  - Metric: ECSServiceAverageCPUUtilization
  - Target value: `70`
- [x] Click "Create"

This ensures:

- Always 1 container running (no cold starts)
- Auto-scales up to 4 containers if CPU > 70%
- Auto-scales down to 1 container when traffic decreases

## 5. Configure Load Balancer and SSL

### Request SSL Certificate

- [x] Go to AWS Console → Certificate Manager (ACM)
- [x] Ensure you're in `us-east-1` region
- [x] Click "Request certificate"
- [x] Certificate type: Request a public certificate
- [x] Domain names:
  - `keypears.com`
  - `www.keypears.com`
  - `*.keypears.com` (optional, for subdomains)
- [x] Validation method: DNS validation
- [x] Click "Request"
- [x] Click on the certificate ID
- [x] Click "Create records in Route 53" (if using Route 53)
- [x] Wait for status to change to "Issued" (5-30 minutes)

### Configure Application Load Balancer

The ALB was created automatically during ECS service creation. Now configure
listeners:

- [x] Go to EC2 → Load Balancers → `keypears-alb`
- [x] Click "Listeners and rules" tab

#### HTTP Listener (Redirect to HTTPS)

- [x] Click "Add listener"
- [x] Protocol: HTTP
- [x] Port: 80
- [x] Default actions: Redirect to HTTPS
  - Protocol: HTTPS
  - Port: 443
  - Status code: 301 (Permanent)
- [x] Click "Add"

#### HTTPS Listener (Forward to Target Group)

- [x] Click "Add listener"
- [x] Protocol: HTTPS
- [x] Port: 443
- [x] Default SSL/TLS certificate: Select your ACM certificate
- [x] Default actions: Forward to
  - Target group: `keypears-tg`
- [x] Click "Add"

### Update Security Groups

- [x] Go to EC2 → Security Groups
- [x] Find ALB security group (auto-created, starts with `keypears-alb`)
- [x] Edit inbound rules:
  - Add rule: HTTP (80) from Anywhere-IPv4 (0.0.0.0/0)
  - Add rule: HTTPS (443) from Anywhere-IPv4 (0.0.0.0/0)
- [x] Save rules

## 6. Configure DNS with AWS Route 53

### Create Hosted Zone

- [x] Go to AWS Console → Route 53 → Hosted zones
- [x] Click "Create hosted zone"
- [x] Domain name: `keypears.com`
- [x] Type: Public hosted zone
- [x] Click "Create hosted zone"
- [x] Note the 4 NS (nameserver) records provided
- [x] Update your domain registrar's nameservers to point to these 4 NS records

### Create Alias Records

- [x] In the hosted zone, click "Create record"
- [x] **Root domain** (`keypears.com`):
  - Record name: (leave blank)
  - Record type: A
  - Alias: Yes
  - Route traffic to: Alias to Application Load Balancer
  - Region: us-east-1
  - Load balancer: `keypears-alb`
  - Click "Create records"
- [x] **WWW subdomain** (`www.keypears.com`):
  - Record name: `www`
  - Record type: A
  - Alias: Yes
  - Route traffic to: Alias to Application Load Balancer
  - Region: us-east-1
  - Load balancer: `keypears-alb`
  - Click "Create records"

### Verify DNS Propagation

Wait 5-60 minutes for DNS to propagate, then test:

```bash
# Check DNS resolution
dig keypears.com
dig www.keypears.com

# Test HTTPS endpoints
curl https://keypears.com
curl https://www.keypears.com
```

## 7. Verify Deployment

- [x] Visit `https://keypears.com` in your browser
- [x] Confirm HTTPS is working (green lock icon)
- [x] Test all pages:
  - Homepage: `https://keypears.com`
  - Blog: `https://keypears.com/blog/`
  - About: `https://keypears.com/about`
  - Privacy: `https://keypears.com/privacy`
  - Terms: `https://keypears.com/terms`
- [x] Check ECS service health:
  - Go to ECS → Clusters → `keypears-cluster` → Services →
    `keypears-webapp-service`
  - Confirm "Running count" is 1
  - Click "Tasks" tab → Click task ID → "Logs" tab to view logs
- [x] Check ALB target health:
  - Go to EC2 → Target Groups → `keypears-tg`
  - Click "Targets" tab
  - Confirm status is "healthy"

## 8. Updating Your Deployment

When you make code changes and want to deploy a new version:

```bash
# Full deployment (build, push, and redeploy)
pnpm deploy
```

This single command will:

1. Authenticate Docker with ECR
2. Build the Docker image for linux/amd64
3. Tag and push the image to ECR
4. Force ECS to pull the new image and redeploy

ECS will:

1. Pull the new `latest` image from ECR
2. Start a new task with the new image
3. Wait for health checks to pass
4. Stop the old task (zero-downtime deployment)

### Alternative Commands

If you only want to build/push without redeploying:

```bash
# Build and push to ECR only
pnpm deploy:build
```

If the image is already in ECR and you just want to redeploy:

```bash
# Force redeployment without rebuilding
pnpm deploy:update
```

## Cost Estimate

Monthly costs for this setup (us-east-1, 24/7 operation):

- **Fargate** (0.25 vCPU, 0.5 GB, 1 task): ~$15
- **Application Load Balancer**: ~$20
- **Data transfer**: ~$5-10 (depends on traffic)
- **ECR storage**: ~$1 (per GB/month)
- **Route 53 hosted zone**: $0.50/month + $0.40 per million queries

**Total: ~$40-50/month**

To reduce costs:

- Use a smaller Fargate task (0.25 vCPU is the minimum)
- Consider AWS Lightsail if traffic is very low (fixed $10-20/month)
- Use CloudFront CDN to reduce ALB traffic and add caching
