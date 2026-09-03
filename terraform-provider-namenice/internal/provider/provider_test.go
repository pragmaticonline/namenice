package provider

import (
	"context"
	"testing"

	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/resource"
)

func TestProviderExposesNameniceConfiguration(t *testing.T) {
	p := New("test")()
	var metadata provider.MetadataResponse
	p.Metadata(context.Background(), provider.MetadataRequest{}, &metadata)
	if metadata.TypeName != "namenice" || metadata.Version != "test" {
		t.Fatalf("metadata = %#v", metadata)
	}

	var schema provider.SchemaResponse
	p.Schema(context.Background(), provider.SchemaRequest{}, &schema)
	for _, name := range []string{"api_url", "api_key", "organization_id"} {
		if _, ok := schema.Schema.GetAttributes()[name]; !ok {
			t.Fatalf("missing provider attribute %q", name)
		}
	}
}

func TestProviderExposesDNSRecordResource(t *testing.T) {
	p := New("test")()
	resources := p.Resources(context.Background())
	if len(resources) != 1 {
		t.Fatalf("resources = %d", len(resources))
	}
	r := resources[0]()
	var metadata resource.MetadataResponse
	r.Metadata(context.Background(), resource.MetadataRequest{ProviderTypeName: "namenice"}, &metadata)
	if metadata.TypeName != "namenice_dns_record" {
		t.Fatalf("resource type = %q", metadata.TypeName)
	}
	var schema resource.SchemaResponse
	r.Schema(context.Background(), resource.SchemaRequest{}, &schema)
	for _, name := range []string{"id", "domain", "host", "type", "value", "ttl", "priority"} {
		if _, ok := schema.Schema.GetAttributes()[name]; !ok {
			t.Fatalf("missing DNS Record attribute %q", name)
		}
	}
}
