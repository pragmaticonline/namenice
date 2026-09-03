package main

import (
	"context"
	"log"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"github.com/pragmaticonline/terraform-provider-namenice/internal/provider"
)

var version = "dev"

func main() {
	err := providerserver.Serve(context.Background(), provider.New(version), providerserver.ServeOpts{
		Address: "registry.terraform.io/pragmaticonline/namenice",
	})
	if err != nil {
		log.Fatal(err)
	}
}
