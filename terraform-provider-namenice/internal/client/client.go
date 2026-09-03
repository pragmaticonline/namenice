package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type Client struct {
	baseURL        string
	apiKey         string
	organizationID int64
	httpClient     *http.Client
}

type Domain struct {
	Domain    string `json:"domain"`
	Status    string `json:"status"`
	ExpiresAt int64  `json:"expires_at"`
}

type DNSRecord struct {
	ID       int64  `json:"id"`
	Host     string `json:"host"`
	Type     string `json:"type"`
	Value    string `json:"value"`
	TTL      int64  `json:"ttl"`
	Priority *int64 `json:"priority"`
}

func New(baseURL, apiKey string, organizationID int64) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"), apiKey: apiKey,
		organizationID: organizationID, httpClient: http.DefaultClient,
	}
}

func (c *Client) request(ctx context.Context, method, path string, body any, target any) error {
	encoded := bytes.NewReader(nil)
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		encoded = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, encoded)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("X-Org", strconv.FormatInt(c.organizationID, 10))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Namenice API returned %s", response.Status)
	}
	if target == nil || response.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(target)
}

func (c *Client) ListDNSRecords(ctx context.Context, domain string) ([]DNSRecord, error) {
	var response struct {
		Records []DNSRecord `json:"records"`
	}
	path := "/api/v1/domains/" + url.PathEscape(domain) + "/dns"
	if err := c.request(ctx, http.MethodGet, path, nil, &response); err != nil {
		return nil, err
	}
	return response.Records, nil
}

func (c *Client) CreateDNSRecord(ctx context.Context, domain string, record DNSRecord) (int64, error) {
	var response struct {
		ID int64 `json:"id"`
	}
	path := "/api/v1/domains/" + url.PathEscape(domain) + "/dns"
	if err := c.request(ctx, http.MethodPost, path, record, &response); err != nil {
		return 0, err
	}
	return response.ID, nil
}

func (c *Client) UpdateDNSRecord(ctx context.Context, domain string, record DNSRecord) error {
	path := "/api/v1/domains/" + url.PathEscape(domain) + "/dns/" + strconv.FormatInt(record.ID, 10)
	return c.request(ctx, http.MethodPatch, path, record, nil)
}

func (c *Client) DeleteDNSRecord(ctx context.Context, domain string, id int64) error {
	path := "/api/v1/domains/" + url.PathEscape(domain) + "/dns/" + strconv.FormatInt(id, 10)
	return c.request(ctx, http.MethodDelete, path, nil, nil)
}

func (c *Client) ListDomains(ctx context.Context) ([]Domain, error) {
	var response struct {
		Domains []Domain `json:"domains"`
	}
	if err := c.request(ctx, http.MethodGet, "/api/v1/domains", nil, &response); err != nil {
		return nil, err
	}
	return response.Domains, nil
}
