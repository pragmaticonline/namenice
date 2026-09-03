package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	resourceschema "github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"

	"github.com/pragmaticonline/terraform-provider-namenice/internal/client"
)

type dnsRecordResource struct{ api *client.Client }

type dnsRecordModel struct {
	ID       types.Int64  `tfsdk:"id"`
	Domain   types.String `tfsdk:"domain"`
	Host     types.String `tfsdk:"host"`
	Type     types.String `tfsdk:"type"`
	Value    types.String `tfsdk:"value"`
	TTL      types.Int64  `tfsdk:"ttl"`
	Priority types.Int64  `tfsdk:"priority"`
}

func newDNSRecordResource() resource.Resource { return &dnsRecordResource{} }

func (r *dnsRecordResource) Metadata(_ context.Context, request resource.MetadataRequest, response *resource.MetadataResponse) {
	response.TypeName = request.ProviderTypeName + "_dns_record"
}

func (r *dnsRecordResource) Schema(_ context.Context, _ resource.SchemaRequest, response *resource.SchemaResponse) {
	response.Schema = resourceschema.Schema{Attributes: map[string]resourceschema.Attribute{
		"id":       resourceschema.Int64Attribute{Computed: true},
		"domain":   resourceschema.StringAttribute{Required: true},
		"host":     resourceschema.StringAttribute{Required: true},
		"type":     resourceschema.StringAttribute{Required: true},
		"value":    resourceschema.StringAttribute{Required: true},
		"ttl":      resourceschema.Int64Attribute{Required: true},
		"priority": resourceschema.Int64Attribute{Optional: true},
	}}
}

func (r *dnsRecordResource) Configure(_ context.Context, request resource.ConfigureRequest, response *resource.ConfigureResponse) {
	if request.ProviderData == nil {
		return
	}
	api, ok := request.ProviderData.(*client.Client)
	if !ok {
		response.Diagnostics.AddError("Unexpected provider data", "Namenice provider was configured with an incompatible client.")
		return
	}
	r.api = api
}

func (r *dnsRecordResource) record(model dnsRecordModel) client.DNSRecord {
	var priority *int64
	if !model.Priority.IsNull() && !model.Priority.IsUnknown() {
		value := model.Priority.ValueInt64()
		priority = &value
	}
	return client.DNSRecord{ID: model.ID.ValueInt64(), Host: model.Host.ValueString(), Type: model.Type.ValueString(), Value: model.Value.ValueString(), TTL: model.TTL.ValueInt64(), Priority: priority}
}

func clientError(diagnostics *diag.Diagnostics, operation string, err error) {
	diagnostics.AddError("Unable to "+operation+" DNS Record", err.Error())
}

func (r *dnsRecordResource) Create(ctx context.Context, request resource.CreateRequest, response *resource.CreateResponse) {
	var plan dnsRecordModel
	response.Diagnostics.Append(request.Plan.Get(ctx, &plan)...)
	if response.Diagnostics.HasError() {
		return
	}
	id, err := r.api.CreateDNSRecord(ctx, plan.Domain.ValueString(), r.record(plan))
	if err != nil {
		clientError(&response.Diagnostics, "create", err)
		return
	}
	plan.ID = types.Int64Value(id)
	response.Diagnostics.Append(response.State.Set(ctx, &plan)...)
}

func (r *dnsRecordResource) Read(ctx context.Context, request resource.ReadRequest, response *resource.ReadResponse) {
	var state dnsRecordModel
	response.Diagnostics.Append(request.State.Get(ctx, &state)...)
	if response.Diagnostics.HasError() {
		return
	}
	records, err := r.api.ListDNSRecords(ctx, state.Domain.ValueString())
	if err != nil {
		clientError(&response.Diagnostics, "read", err)
		return
	}
	for _, record := range records {
		if record.ID != state.ID.ValueInt64() {
			continue
		}
		state.Host = types.StringValue(record.Host)
		state.Type = types.StringValue(record.Type)
		state.Value = types.StringValue(record.Value)
		state.TTL = types.Int64Value(record.TTL)
		if record.Priority == nil {
			state.Priority = types.Int64Null()
		} else {
			state.Priority = types.Int64Value(*record.Priority)
		}
		response.Diagnostics.Append(response.State.Set(ctx, &state)...)
		return
	}
	response.State.RemoveResource(ctx)
}

func (r *dnsRecordResource) Update(ctx context.Context, request resource.UpdateRequest, response *resource.UpdateResponse) {
	var plan dnsRecordModel
	response.Diagnostics.Append(request.Plan.Get(ctx, &plan)...)
	if response.Diagnostics.HasError() {
		return
	}
	if err := r.api.UpdateDNSRecord(ctx, plan.Domain.ValueString(), r.record(plan)); err != nil {
		clientError(&response.Diagnostics, "update", err)
		return
	}
	response.Diagnostics.Append(response.State.Set(ctx, &plan)...)
}

func (r *dnsRecordResource) Delete(ctx context.Context, request resource.DeleteRequest, response *resource.DeleteResponse) {
	var state dnsRecordModel
	response.Diagnostics.Append(request.State.Get(ctx, &state)...)
	if response.Diagnostics.HasError() {
		return
	}
	if err := r.api.DeleteDNSRecord(ctx, state.Domain.ValueString(), state.ID.ValueInt64()); err != nil {
		clientError(&response.Diagnostics, "delete", err)
	}
}
