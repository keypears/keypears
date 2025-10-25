# Webapp Deployment Tasklist

- [ ] **1. Containerize Your Webapp**
  - [ ] Create a `Dockerfile` in the `webapp` directory.
  - [ ] Build the Docker image.
  - [ ] Test the Docker image locally.

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
