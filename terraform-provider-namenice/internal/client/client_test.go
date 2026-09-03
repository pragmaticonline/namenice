package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListDomainsUsesOrganizationAPIKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/domains" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer nn_test" {
			t.Fatalf("authorization = %q", got)
		}
		if got := r.Header.Get("X-Org"); got != "42" {
			t.Fatalf("organization = %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"domains": []map[string]any{{"domain": "example.com", "status": "active", "expires_at": 2000000000}},
		})
	}))
	defer server.Close()

	api := New(server.URL, "nn_test", 42)
	domains, err := api.ListDomains(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(domains) != 1 || domains[0].Domain != "example.com" || domains[0].Status != "active" {
		t.Fatalf("domains = %#v", domains)
	}
}
