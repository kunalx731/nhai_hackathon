terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ── DynamoDB (on-demand — no minimum cost, free tier: 25 GB storage) ──────────

resource "aws_dynamodb_table" "events" {
  name         = "${var.prefix}-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = { Project = "faceauth-hackathon" }
}

# ── IAM role for Lambda ────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_exec" {
  name = "${var.prefix}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.prefix}-lambda-policy"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:BatchWriteItem", "dynamodb:PutItem", "dynamodb:Scan"]
        Resource = aws_dynamodb_table.events.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# ── Lambda function ────────────────────────────────────────────────────────────

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "faceauth" {
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  function_name    = "${var.prefix}-api"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 15

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.events.name
    }
  }

  tags = { Project = "faceauth-hackathon" }
}

# ── API Gateway HTTP API ($1/million requests — cheapest option) ──────────────

resource "aws_apigatewayv2_api" "faceauth" {
  name          = "${var.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["POST", "GET", "OPTIONS"]
    allow_headers = ["Content-Type", "x-api-key"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.faceauth.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.faceauth.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.faceauth.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "sync" {
  api_id    = aws_apigatewayv2_api.faceauth.id
  route_key = "POST /sync"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "attendance" {
  api_id    = aws_apigatewayv2_api.faceauth.id
  route_key = "GET /attendance"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.faceauth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.faceauth.execution_arn}/*/*"
}
