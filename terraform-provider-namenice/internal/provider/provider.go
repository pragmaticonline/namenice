package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	providerschema "github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"

	"github.com/pragmaticonline/terraform-provider-namenice/internal/client"
)

type nameniceProvider struct{ version string }

type providerModel struct {
	APIURL         types.String `tfsdk:"api_url"`
	APIKey         types.String `tfsdk:"api_key"`
	OrganizationID types.Int64  `tfsdk:"organization_id"`
}

func New(version string) func() provider.Provider {
	return func() provider.Provider { return &nameniceProvider{version: version} }
}

func (p *nameniceProvider) Metadata(_ context.Context, _ provider.MetadataRequest, response *provider.MetadataResponse) {
	response.TypeName = "namenice"
	response.Version = p.version
}

func (p *nameniceProvider) Schema(_ context.Context, _ provider.SchemaRequest, response *provider.SchemaResponse) {
	response.Schema = providerschema.Schema{Attributes: map[string]providerschema.Attribute{
		"api_url": providerschema.StringAttribute{Optional: true, Description: "Namenice API base URL; defaults to https://www.namenice.net."},
		"api_key": providerschema.StringAttribute{Required: true, Sensitive: true, Description: "Organization API Key."},
		"organization_id": providerschema.Int64Attribute{
			Required:    true,
			Description: "Organization owning managed resources.",
			Validators:  []validator.Int64{int64validator.AtLeast(1)},
		},
	}}
}

func (p *nameniceProvider) Configure(ctx context.Context, request provider.ConfigureRequest, response *provider.ConfigureResponse) {
	var config providerModel
	response.Diagnostics.Append(request.Config.Get(ctx, &config)...)
	if response.Diagnostics.HasError() || config.APIKey.IsUnknown() || config.OrganizationID.IsUnknown() {
		return
	}
	baseURL := "https://www.namenice.net"
	if !config.APIURL.IsNull() && config.APIURL.ValueString() != "" {
		baseURL = config.APIURL.ValueString()
	}
	api := client.New(baseURL, config.APIKey.ValueString(), config.OrganizationID.ValueInt64())
	response.DataSourceData = api
	response.ResourceData = api
}

func (p *nameniceProvider) DataSources(context.Context) []func() datasource.DataSource { return nil }
func (p *nameniceProvider) Resources(context.Context) []func() resource.Resource {
	return []func() resource.Resource{newDNSRecordResource}
}
