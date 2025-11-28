# Webapp Deployment Guide

## 1. Containerize Your Webapp ✅ COMPLETED

The webapp has been successfully containerized using Docker with a multi-stage
build process optimized for the TypeScript monorepo structure (webapp with
integrated orpc API).

### Architecture

The production container runs a single Express server on port 4273:

- **Integrated Server (Node.js)**: Port 4273 - Express server serving the React
  Router 7 webapp with integrated orpc API at `/api/*`

The server runs in a Docker container and is load-balanced through AWS ALB.

### Building and Testing with pnpm Scripts (Recommended)

Before building the Docker image, you must build the TypeScript packages:

```bash
# Build everything (TypeScript packages + Docker image)
pnpm run build:all
```

Then test the production webapp locally:

```bash
# Start the webapp container (builds and runs in background)
pnpm webapp:up

# View live logs (you should see the Express server starting)
pnpm webapp:logs

# Stop and remove the container
pnpm webapp:down
```

These scripts use Docker Compose (configured in `docker-compose.yml` at the
monorepo root) to:

- Build the Docker image from `Dockerfile`
- Start the container with proper configuration
- Handle cleanup automatically

### Build Pipeline

The build process follows these steps:

1. **Build TypeScript packages**: `pnpm run build:packages` builds
   `@keypears/lib` and `@keypears/api-server`
2. **Build Docker image**: `pnpm run build:webapp` creates the Docker image
   (linux/amd64)

The deployment command `pnpm run deploy:all` runs all these steps automatically.

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

# Test the API (integrated orpc API)
curl -X POST http://keypears.localhost:4273/api/blake3 \
  -H "Content-Type: application/json" \
  -d '{"data":"aGVsbG8gd29ybGQ="}'
```

### Manual Docker Commands (Alternative)

If you prefer to use Docker commands directly:

```bash
# Build the image (for linux/amd64 platform, required for Fargate)
docker buildx build --platform linux/amd64 -t keypears-webapp:latest .

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

- Building `@keypears/lib` package (TypeScript)
- Building `@keypears/api-server` package (TypeScript)
- Building `webapp` with React Router (TypeScript)
- Installing production dependencies only in the final image
- Copying markdown content files for blog posts and static pages

### Environment Variables

The production container uses the following environment variables:

- `PORT` - Webapp server port (default: 4273)
- `NODE_ENV` - Set to `production` in Docker (automatic)

The Express server handles both webapp routes and integrated orpc API at
`/api/*`.

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
# Build everything, tag, and push to ECR
pnpm deploy:build
```

This command will:

1. Authenticate Docker with ECR
2. Build TypeScript packages (`@keypears/lib` and `@keypears/api-server`)
3. Build the Docker image (for linux/amd64 platform)
4. Tag the image for ECR
5. Push to ECR
6. Verify the push succeeded

### Individual Deployment Commands

If you prefer to run steps individually:

```bash
# 1. Authenticate Docker with ECR (token valid for 12 hours)
pnpm deploy:login

# 2. Build TypeScript packages
pnpm build:packages

# 3. Build the Docker image
pnpm build:webapp

# 4. Tag the image for ECR
pnpm deploy:tag

# 5. Push to ECR
pnpm deploy:push

# 6. Verify the image was pushed
pnpm deploy:verify
```

Or use the combined commands:

```bash
# Build everything (TypeScript packages + Docker image)
pnpm build:all

# Then push to ECR
pnpm deploy:tag
pnpm deploy:push
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
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "keypears-webapp",
      "image": "299190761597.dkr.ecr.us-east-1.amazonaws.com/keypears-webapp:latest",
      "cpu": 512,
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
- [x] Attach policies:
  - `AmazonECSTaskExecutionRolePolicy` (required for ECS)
  - `CloudWatchLogsFullAccess` (required for container logs)
- [x] Name: `ecsTaskExecutionRole`
- [x] Create role

**Important**: The role must have CloudWatch Logs permissions to create log
groups and streams. Without this, tasks will fail with "AccessDeniedException"
errors.

### Create ECS Service

- [x] Go to ECS → Clusters → `keypears-cluster`
- [x] Click "Services" tab → "Create"
- [x] Settings:
  - **Compute options**: Launch type → Fargate
  - **Task definition**: `keypears-webapp-task` (latest)
  - **Service name**: `keypears-webapp-service`
  - **Desired tasks**: `1` (ensures always 1 container running, no cold starts)
- [x] **Deployment configuration**:
  - Minimum healthy percent: `100` (keeps 1 task running during deployment)
  - Maximum percent: `400` (allows up to 4 tasks during deployment for faster
    rollouts)
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

**Important**: After service is created, configure security groups properly:

### Create Separate ALB Security Group

The ALB needs its own security group (separate from the container):

- [x] Go to EC2 → Security Groups → Create security group
- [x] Settings:
  - Name: `keypears-alb-sg`
  - Description: "Security group for KeyPears Application Load Balancer"
  - VPC: `keypears-vpc`
  - **Inbound rules**:
    - Type: HTTP, Port: 80, Source: `0.0.0.0/0`, Description: "Allow HTTP from
      internet"
    - Type: HTTPS, Port: 443, Source: `0.0.0.0/0`, Description: "Allow HTTPS
      from internet"
  - **Outbound rules**: Leave default (all traffic)
- [x] Click "Create security group"

### Attach ALB Security Group to Load Balancer

- [x] Go to EC2 → Load Balancers → `keypears-alb`
- [x] Click "Security" tab → "Edit security groups"
- [x] Remove `keypears-webapp-sg` (the container security group)
- [x] Add `keypears-alb-sg` (the new ALB security group)
- [x] Save changes

### Update Container Security Group

Now update the container security group to only allow traffic from the ALB:

- [x] Go to EC2 → Security Groups → `keypears-webapp-sg`
- [x] Edit inbound rules
- [x] Delete the existing port 4273 rule (with source `0.0.0.0/0`)
- [x] Add new rule:
  - Type: Custom TCP
  - Port: 4273
  - Source: Custom → search for `keypears-alb-sg` security group
  - Select it from the dropdown (AWS will auto-suggest)
  - Description: "Allow traffic from ALB"
- [x] Save rules

This ensures:

- Public internet can reach the ALB on ports 80/443
- Only the ALB can reach the container on port 4273
- Container is not directly accessible from the internet

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
- Auto-scales up to 10 containers if CPU > 70%
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
  - API Test Page: `https://keypears.com/api-test` (Blake3 hashing demo)
- [x] Test API endpoints directly:
  ```bash
  # Test Blake3 hashing endpoint (base64 input "hello world")
  curl -X POST https://keypears.com/api/blake3 \
    -H "Content-Type: application/json" \
    -d '{"data":"aGVsbG8gd29ybGQ="}'

  # Expected output:
  # {"hash":"d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24"}
  ```
- [x] Check ECS service health:
  - Go to ECS → Clusters → `keypears-cluster` → Services →
    `keypears-webapp-service`
  - Confirm "Running count" is 1
  - Click "Tasks" tab → Click task ID → "Logs" tab to view logs
- [x] Check ALB target health:
  - Go to EC2 → Target Groups → `keypears-tg`
  - Click "Targets" tab
  - Confirm status is "healthy"
- [x] Test canonical URL redirects:
  - `http://keypears.com` → redirects to `https://keypears.com`
  - `http://www.keypears.com` → redirects to `https://keypears.com`
  - `https://www.keypears.com` → redirects to `https://keypears.com`
  - `https://keypears.com` → stays (canonical)

## 7.1. Canonical URL Redirects

The webapp includes Express middleware that automatically redirects all traffic
to the canonical URL `https://keypears.com`. This ensures:

- Consistent URLs for SEO
- HTTPS-only access (except for health checks)
- No `www` subdomain in URLs

### How It Works:

The redirect logic in `webapp/server.ts` only redirects these specific URLs:

- `http://keypears.com` → `https://keypears.com`
- `http://www.keypears.com` → `https://keypears.com`
- `https://www.keypears.com` → `https://keypears.com`

All other requests (including ALB health checks from internal IPs) pass through
without redirect. This prevents health check failures while still enforcing
canonical URLs for public traffic.

### Implementation:

```typescript
// Canonical URL redirect middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers.host;

  // Only redirect these specific non-canonical URLs
  const shouldRedirect =
    (protocol === "http" && host === "keypears.com") ||
    (protocol === "http" && host === "www.keypears.com") ||
    (protocol === "https" && host === "www.keypears.com");

  if (shouldRedirect) {
    const canonicalUrl = `https://keypears.com${req.originalUrl}`;
    return res.redirect(301, canonicalUrl);
  }

  next();
});
```

**Important**: This middleware only runs on production URLs. Development servers
(localhost, keypears.localhost) are unaffected since they don't match the
redirect conditions.

## 8. Updating Your Deployment

When you make code changes and want to deploy a new version:

```bash
# Full deployment (build everything, push, and redeploy)
pnpm deploy:all
```

This single command will:

1. Authenticate Docker with ECR
2. Build TypeScript packages (`@keypears/lib` and `@keypears/api-server`)
3. Build the Docker image for linux/amd64
4. Tag and push the image to ECR
5. Force ECS to pull the new image and redeploy

ECS will:

1. Pull the new `latest` image from ECR
2. Start a new task with the new image
3. Wait for health checks to pass on the webapp (port 4273)
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

If you only changed TypeScript code:

```bash
# Rebuild TypeScript packages and redeploy
pnpm build:packages
pnpm build:webapp
pnpm deploy:tag
pnpm deploy:push
pnpm deploy:update
```

## 9. Database Schema Management

KeyPears uses PostgreSQL for the server database with Drizzle ORM. Database
schema management uses `drizzle-kit push` instead of traditional migrations,
which is appropriate for pre-MVP development.

### Philosophy

- **No migrations**: We use `drizzle-kit push` to directly apply schema changes
- **Pre-launch workflow**: Acceptable to wipe databases frequently since no real
  user data exists yet
- **Post-launch**: This workflow will be refined for production data safety with
  proper migrations

### Schema Location

All database schemas are defined in `api-server/src/db/schema.ts`. The webapp
references this via `node_modules/@keypears/api-server/src/db/schema.ts`.

### Development Database

Start the local PostgreSQL database (Docker container):

```bash
# Start Postgres 17.5 in Docker
pnpm db:up

# Stop Postgres
pnpm db:down

# Reset database (deletes Docker volume and all data)
pnpm db:reset
```

The development database runs on `localhost:5432` with credentials
`keypears/keypears_dev` and database name `keypears_main`.

### Updating Database Schema

When you modify `api-server/src/db/schema.ts`:

**Step 1: Build the api-server package** (from root):

```bash
pnpm --filter @keypears/api-server build
```

**Step 2: Update development database** (from `webapp/` directory):

```bash
# Clear database (wipes all data by pushing empty schema)
pnpm db:dev:clear

# Push schema (applies full schema to empty database)
pnpm db:dev:push
```

**Step 3: Update staging database** (from `webapp/` directory):

```bash
# Ensure .env.staging has correct DATABASE_URL
pnpm db:staging:clear
pnpm db:staging:push

# Verify staging database looks correct
```

**Step 4: Update production database** (PlanetScale):

1. After pushing schema to staging (above), verify it looks correct
2. In PlanetScale dashboard, create a "pull request" from staging to production
3. Review the schema changes (NOT data changes) in the pull request
4. If changes look correct, accept the pull request
5. PlanetScale automatically updates production database schema

### Important Notes

- **Always use webapp scripts**: Run all `db:*` commands from `webapp/` directory
  or via root `package.json`. Never run drizzle-kit directly from `api-server/`.
- **Clear vs Push**: `db:dev:clear` wipes data by pushing an empty schema.
  `db:dev:push` applies the full schema. Always run clear before push when
  changing schema structure.
- **Destructive operations**: Schema pushes in development and staging are
  destructive (they wipe data). This is acceptable pre-launch but will change
  post-MVP.
- **PlanetScale workflow**: The PlanetScale "pull request" feature handles schema
  changes safely in production by creating a branch, reviewing changes, and
  merging when ready.

### Database Connection

The webapp connects to PostgreSQL using the `DATABASE_URL` environment variable:

- **Development**: `postgresql://keypears:keypears_dev@localhost:5432/keypears_main`
- **Staging**: Configured in `.env.staging` (PlanetScale connection string)
- **Production**: Configured via ECS task environment variables (PlanetScale
  connection string)

## Cost Estimate

Monthly costs for this setup (us-east-1, 24/7 operation):

- **Fargate** (0.5 vCPU, 1 GB, 1 task): ~$30
- **Application Load Balancer**: ~$20
- **Data transfer**: ~$5-10 (depends on traffic)
- **ECR storage**: ~$1 (per GB/month)
- **Route 53 hosted zone**: $0.50/month + $0.40 per million queries

**Total: ~$55-65/month**

To reduce costs:

- Use a smaller Fargate task (0.25 vCPU + 512 MB is minimum, ~$15/month, but may
  cause deployment issues with Node.js)
- Consider AWS Lightsail if traffic is very low (fixed $10-20/month)
- Use CloudFront CDN to reduce ALB traffic and add caching

**Note**: The 0.5 vCPU + 1 GB configuration is recommended for reliable
deployments with Node.js + React SSR. Smaller configurations may cause
out-of-memory errors during container startup.
