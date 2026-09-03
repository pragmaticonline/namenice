terraform {
  required_providers {
    namenice = {
      source = "pragmaticonline/namenice"
    }
  }
}

variable "namenice_api_key" {
  type      = string
  sensitive = true
}

variable "namenice_organization_id" {
  type = number
}

provider "namenice" {
  api_key         = var.namenice_api_key
  organization_id = var.namenice_organization_id
}

resource "namenice_dns_record" "www" {
  domain = "example.com"
  host   = "www"
  type   = "A"
  value  = "192.0.2.1"
  ttl    = 300
}
