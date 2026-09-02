// Copyright (c) 2026, Wahni IT Solutions Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide("genie");

genie.ChangeRequest = class ChangeRequest {
    constructor() {
        this.setup_dialog();
        this.dialog.show();
    }

    async setup_dialog() {
        this.dialog = new frappe.ui.Dialog({
            title: __("Request Change"),
            size: "large",
            minimizable: true,
            static: true,
            fields: [
                {
                    fieldtype: "Section Break",
                    label: __("General Information"),
                },
                {
                    fieldname: "cr_title",
                    label: __("Title"),
                    fieldtype: "Data",
                    reqd: 1,
                },
                {
                    fieldname: "cr_type",
                    label: __("Type"),
                    fieldtype: "Select",
                    options: ["Custom", "INT", "Config"],
                    default: "Custom",
                },
                {
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "impact",
                    label: __("Impact"),
                    fieldtype: "Select",
                    options: ["Low", "Medium", "High"],
                    default: "Low",
                },
                {
                    fieldname: "department",
                    label: __("Department"),
                    fieldtype: "Link",
                    options: "Department",
                },
                {
                    fieldtype: "Section Break",
                    label: __("User Details"),
                },
                {
                    fieldname: "email",
                    label: __("Email"),
                    fieldtype: "Read Only",
                    default: frappe.session.user_email,
                },
                {
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "user_name",
                    label: __("User"),
                    fieldtype: "Read Only",
                    default: frappe.session.user_fullname,
                },
                {
                    fieldtype: "Section Break",
                    label: __("Change Description"),
                },
                {
                    fieldname: "change_description",
                    label: __("Change Description"),
                    fieldtype: "Text Editor",
                    reqd: 1,
                },
                {
                    fieldtype: "Section Break",
                    label: __("Business Justification"),
                },
                {
                    fieldname: "business_justification",
                    label: __("Business Justification"),
                    fieldtype: "Text Editor",
                    reqd: 1,
                },
                {
                    fieldtype: "Section Break",
                    label: __("Attachments"),
                },
                {
                    fieldname: "attachments",
                    label: __("Attachments"),
                    fieldtype: "Table",
                    cannot_add_rows: false,
                    in_place_edit: true,
                    data: [],
                    get_data: () => [],
                    fields: [
                        {
                            fieldname: "file",
                            label: __("File"),
                            fieldtype: "Attach",
                            in_list_view: 1,
                            reqd: 1,
                        },
                    ],
                },
            ],
            primary_action_label: __("Submit Change Request"),
            primary_action: (values) => {
                this.submit_cr(values);
            },
            secondary_action_label: __("Cancel"),
            secondary_action: () => {
                this.dialog.hide();
            },
        });

        const r = await frappe.db.get_value("Employee", { user_id: frappe.session.user }, "department");
        if (r && r.message && r.message.department) {
            this.dialog.set_value("department", r.message.department);
        }
    }

    submit_cr(values) {
        frappe.call({
            method: "genie.utils.support.create_change_request",
            type: "POST",
            args: {
                title: values.cr_title,
                cr_type: values.cr_type,
                impact: values.impact,
                change_description: values.change_description,
                business_justification: values.business_justification,
                user: values.email,
                user_fullname: values.user_name,
                attachments: values.attachments,
                department: values.department,
            },
            freeze: true,
            freeze_message: __("Submitting Change Request..."),
            callback: (r) => {
                if (!r.exc && r.message) {
                    frappe.show_alert({
                        indicator: "green",
                        message: __(`Change Request created successfully (${r.message})`),
                    });
                    this.dialog.hide();
                    frappe.msgprint(
                        __(`Your Change Request (<b>${r.message}</b>) has been created with status <b>Pending</b>. Upon approval, it will automatically be created in Opero.`)
                    );
                }
            },
        });
    }
};

