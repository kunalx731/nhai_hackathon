output "api_url" {
  description = "API Gateway base URL — paste into constants/aws.ts as apiEndpoint"
  value       = aws_apigatewayv2_stage.prod.invoke_url
}
