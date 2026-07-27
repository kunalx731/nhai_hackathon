variable "region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "ap-south-1"
}

variable "prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "faceauth-hackathon"
}
