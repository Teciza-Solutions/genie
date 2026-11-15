// Copyright (c) 2026, Wahni IT Solutions Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide("genie");

// Inject styles for wizard pills
genie.ensure_cr_styles = function () {
    if (document.getElementById("genie-cr-wizard-styles")) return;
    const style = document.createElement("style");
    style.id = "genie-cr-wizard-styles";
    style.textContent = `
    .cr-wiz-pills {
        list-style: none;
        margin: 0 0 16px 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .cr-wiz-pills li { margin: 0; padding: 0; }
    .cr-wiz-pills button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--border-color, #d1d8dd);
        background: var(--control-bg, #f4f5f6);
        border-radius: 999px;
        padding: 4px 12px 4px 6px;
        cursor: pointer;
        font-size: 12px;
        color: #111827;
        font-weight: 500;
        transition: all 0.15s ease;
        line-height: 1.4;
    }
    .cr-wiz-pills button span {
        display: inline-grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #ffffff;
        border: 1px solid var(--border-color, #d1d8dd);
        font-weight: 700;
        font-size: 11px;
        color: #111827;
    }
    .cr-wiz-pills button.done {
        color: #15803d !important;
        border-color: #86efac !important;
        background: #f0fdf4 !important;
        font-weight: 600 !important;
    }
    .cr-wiz-pills button.done span {
        background: #15803d !important;
        color: #ffffff !important;
        border-color: #15803d !important;
    }
    .cr-wiz-pills button.cur {
        color: #000000 !important;
        background: var(--primary, #ffd84d) !important;
        border-color: #cca000 !important;
        font-weight: 700 !important;
    }
    .cr-wiz-pills button.cur span {
        color: #ffffff !important;
        background: #000000 !important;
        border-color: #000000 !important;
        font-weight: 700 !important;
    }
    .cr-wiz-pills button:disabled {
        opacity: 0.6;
        cursor: default;
    }
    `;
    document.head.appendChild(style);
};

genie.ChangeRequest = class ChangeRequest {
    constructor() {
        genie.ensure_cr_styles();
        this.step = 0;
        this.setup_dialog();
    }

    async setup_dialog() {
        const default_company = frappe.defaults.get_user_default("Company") || frappe.defaults.get_default("company") || "";
        const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";

        const all_steps = [
            {
                key: "type",
                label: "Type",
                title: __("What kind of request is it?"),
                help: __("Pick the one that fits best. Enterprise Solutions can change it later."),
                fieldnames: ["sec_step1", "type"]
            },
            {
                key: "who",
                label: "Requester",
                title: __("Who is asking?"),
                help: __("The company and department decide the approval track."),
                fieldnames: [
                    "sec_step2", "system_affected", "company", "col_break_2",
                    "employee", "requested_by", "requested_by_fullname", "department", "date"
                ]
            },
            {
                key: "need",
                label: "Requirement",
                title: __("What is needed?"),
                help: __("Describe the outcome you want, not only the screen."),
                fieldnames: [
                    "sec_step3", "title", "change_description", "current_process", "expected_benefit"
                ]
            },
            {
                key: "size",
                label: "Size",
                title: __("How big is the problem?"),
                help: __("These numbers help compare requests across the group."),
                fieldnames: [
                    "sec_step4", "users_count", "frequency", "col_break_4",
                    "hours_spent_per_week", "reference_documents", "attachments"
                ]
            },
            {
                key: "imp",
                label: "Importance",
                title: __("How important is it?"),
                help: __("Rate it honestly. Enterprise Solutions confirms the score and it sets the request's priority."),
                fieldnames: [
                    "sec_step5", "impact_rating", "urgency_rating", "reach_rating",
                    "is_mandatory", "mandatory_reason", "col_break_5",
                    "needed_by", "reason_for_date", "priority_score", "priority"
                ]
            },
            {
                key: "assess",
                label: "Assessment",
                title: __("Enterprise Solutions assessment"),
                help: __("Approvers see this when they decide."),
                for_role: "ERP Head",
                fieldnames: [
                    "sec_step6", "effort_days", "developer", "col_break_6",
                    "target_delivery_date", "planned_overtime_hours", "solution_approach"
                ]
            },
            {
                key: "review",
                label: "Review & submit",
                title: __("Check and submit"),
                help: __("Go back to any step to change it."),
                fieldnames: ["sec_step7", "review_html"]
            }
        ];

        this.steps = all_steps.filter(s => !s.for_role || (s.for_role === "ERP Head" && has_erp_head));

        this.dialog = new frappe.ui.Dialog({
            title: __("New Change Request"),
            size: "large",
            fields: [
                // STEP 1: Type
                {
                    fieldname: "sec_step1",
                    fieldtype: "Section Break",
                    label: __("Step 1: Request Type"),
                },
                {
                    fieldname: "type",
                    label: __("Type"),
                    fieldtype: "Select",
                    options: "\nNew development\nEnhancement\nMinor change",
                    description: __("Pick the one that fits best. Enterprise Solutions can change it later."),
                    reqd: 1,
                },

                // STEP 2: Requester
                {
                    fieldname: "sec_step2",
                    fieldtype: "Section Break",
                    label: __("Step 2: Requester & Scope"),
                },
                {
                    fieldname: "system_affected",
                    label: __("System Affected"),
                    fieldtype: "Data",
                    default: "ERP",
                    description: __("System affected (default: ERP)"),
                    reqd: 1,
                },
                {
                    fieldname: "company",
                    label: __("Company"),
                    fieldtype: "Link",
                    options: "Company",
                    default: default_company,
                    description: __("The company decides the approval route"),
                    reqd: 1,
                },
                {
                    fieldname: "col_break_2",
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "employee",
                    label: __("Employee"),
                    fieldtype: "Link",
                    options: "Employee",
                    description: __("Employee ID of the requester"),
                },
                {
                    fieldname: "requested_by",
                    label: __("Requested By"),
                    fieldtype: "Link",
                    options: "User",
                    default: frappe.session.user,
                    read_only: 1,
                },
                {
                    fieldname: "requested_by_fullname",
                    label: __("Requested By Full Name"),
                    fieldtype: "Data",
                    default: frappe.session.user_fullname || frappe.session.user,
                    read_only: 1,
                },
                {
                    fieldname: "department",
                    label: __("Department"),
                    fieldtype: "Link",
                    options: "Department",
                    description: __("Department of the requester"),
                    reqd: 1,
                },
                {
                    fieldname: "date",
                    label: __("Date"),
                    fieldtype: "Date",
                    default: frappe.datetime.get_today(),
                },

                // STEP 3: Requirement Details
                {
                    fieldname: "sec_step3",
                    fieldtype: "Section Break",
                    label: __("Step 3: Requirement Details"),
                },
                {
                    fieldname: "title",
                    label: __("Title"),
                    fieldtype: "Data",
                    description: __("e.g. Add approval step for purchase requests above QAR 50,000"),
                    reqd: 1,
                },
                {
                    fieldname: "change_description",
                    label: __("What is Needed"),
                    fieldtype: "Text Editor",
                    description: __("Screens, fields, steps, approvals or reports you need"),
                    reqd: 1,
                },
                {
                    fieldname: "current_process",
                    label: __("How it Works Today"),
                    fieldtype: "Small Text",
                    description: __("Current process, tools and the problem with it"),
                    reqd: 1,
                },
                {
                    fieldname: "expected_benefit",
                    label: __("Expected Benefit"),
                    fieldtype: "Small Text",
                    description: __("Time saved, errors avoided, control gained"),
                    reqd: 1,
                },

                // STEP 4: Size & Attachments
                {
                    fieldname: "sec_step4",
                    fieldtype: "Section Break",
                    label: __("Step 4: Problem Size & Attachments"),
                },
                {
                    fieldname: "users_count",
                    label: __("Number of Users"),
                    fieldtype: "Int",
                    description: __("People who will use it"),
                    reqd: 1,
                },
                {
                    fieldname: "frequency",
                    label: __("How Often Process Runs"),
                    fieldtype: "Select",
                    options: "\nSeveral times a day\nDaily\nWeekly\nMonthly\nQuarterly or less",
                    description: __("How often the process runs"),
                },
                {
                    fieldname: "col_break_4",
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "hours_spent_per_week",
                    label: __("Hours Spent Per Week Today"),
                    fieldtype: "Float",
                    description: __("Across everyone involved"),
                },
                {
                    fieldname: "reference_documents",
                    label: __("Reference Documents"),
                    fieldtype: "Small Text",
                    description: __("Form names, sample reports, links"),
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
                        {
                            fieldname: "file_name",
                            label: __("File Name"),
                            fieldtype: "Data",
                            in_list_view: 1,
                        }
                    ],
                },

                // STEP 5: Importance & Priority
                {
                    fieldname: "sec_step5",
                    fieldtype: "Section Break",
                    label: __("Step 5: Importance & Priority"),
                },
                {
                    fieldname: "impact_rating",
                    label: __("Business Impact"),
                    fieldtype: "Select",
                    options: "\n1 - Minor convenience\n2 - Small saving\n3 - Clear saving for a team\n4 - Major cost or time saving\n5 - Critical to operations or revenue",
                    description: __("Business impact on operations, cost, or revenue"),
                    reqd: 1,
                },
                {
                    fieldname: "urgency_rating",
                    label: __("Urgency"),
                    fieldtype: "Select",
                    options: "\n1 - Whenever possible\n2 - This quarter\n3 - This month\n4 - Within two weeks\n5 - Blocking work now",
                    description: __("Timeline urgency for business operations"),
                    reqd: 1,
                },
                {
                    fieldname: "reach_rating",
                    label: __("Reach"),
                    fieldtype: "Select",
                    options: "\n1 - One person\n2 - One team\n3 - One department\n4 - One company\n5 - Several companies / group",
                    description: __("Scope of users and departments affected"),
                    reqd: 1,
                },
                {
                    fieldname: "is_mandatory",
                    label: __("Mandatory (audit, legal, ISO, contract, management order)"),
                    fieldtype: "Check",
                    description: __("Yes · audit, legal, ISO, contract, management order"),
                },
                {
                    fieldname: "mandatory_reason",
                    label: __("Mandatory Reason"),
                    fieldtype: "Small Text",
                    description: __("Audit finding, ISO clause, contract, management order"),
                },
                {
                    fieldname: "col_break_5",
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "needed_by",
                    label: __("Needed By"),
                    fieldtype: "Date",
                    description: __("Target date needed by"),
                },
                {
                    fieldname: "reason_for_date",
                    label: __("Reason for the Date"),
                    fieldtype: "Data",
                    description: __("e.g. Year-end closing"),
                },
                {
                    fieldname: "priority_score",
                    label: __("Priority Score (0-100)"),
                    fieldtype: "Int",
                    read_only: 1,
                },
                {
                    fieldname: "priority",
                    label: __("Priority Level"),
                    fieldtype: "Data",
                    read_only: 1,
                },

                // STEP 6: Assessment (ES Assessment)
                {
                    fieldname: "sec_step6",
                    fieldtype: "Section Break",
                    label: __("Step 6: Assessment & Timeline"),
                },
                {
                    fieldname: "effort_days",
                    label: __("Effort (Working Days)"),
                    fieldtype: "Float",
                    description: __("Effort in working days"),
                },
                {
                    fieldname: "developer",
                    label: __("Assigned Developer"),
                    fieldtype: "Data",
                    description: __("Assigned developer"),
                },
                {
                    fieldname: "col_break_6",
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "target_delivery_date",
                    label: __("Target Delivery Date"),
                    fieldtype: "Date",
                    description: __("Target delivery date"),
                },
                {
                    fieldname: "planned_overtime_hours",
                    label: __("Planned Overtime (Hours)"),
                    fieldtype: "Float",
                    description: __("Planned overtime in hours"),
                },
                {
                    fieldname: "solution_approach",
                    label: __("Solution Approach / Note for Approvers"),
                    fieldtype: "Small Text",
                    description: __("Scope, approach, dependencies, risks"),
                },

                // STEP 7: Review & submit
                {
                    fieldname: "sec_step7",
                    fieldtype: "Section Break",
                    label: __("Step 7: Check and Submit"),
                },
                {
                    fieldname: "review_html",
                    fieldtype: "HTML",
                }
            ]
        });

        // Hide default primary/secondary dialog action buttons
        this.dialog.get_primary_btn().hide();
        this.dialog.get_secondary_btn().hide();

        this.mount_wizard_bar();
        this.mount_footer_buttons();
        this.bind_change_events();

        // Auto-fetch employee and department
        await this.auto_fetch_employee(frappe.session.user);

        this.render_step();
        this.dialog.show();
    }

    async auto_fetch_employee(user_id) {
        if (!user_id) return;
        try {
            const r = await frappe.db.get_value("Employee", { user_id: user_id }, ["name", "department", "employee_name", "company"]);
            if (r && r.message) {
                const emp = r.message;
                if (emp.name && !this.dialog.get_value("employee")) {
                    this.dialog.set_value("employee", emp.name);
                }
                if (emp.department && !this.dialog.get_value("department")) {
                    this.dialog.set_value("department", emp.department);
                }
                if (emp.employee_name && !this.dialog.get_value("requested_by_fullname")) {
                    this.dialog.set_value("requested_by_fullname", emp.employee_name);
                }
                if (emp.company && !this.dialog.get_value("company")) {
                    this.dialog.set_value("company", emp.company);
                }
            }
        } catch (e) {
            // pass
        }
    }

    async on_employee_change(emp_id) {
        if (!emp_id) return;
        try {
            const r = await frappe.db.get_value("Employee", emp_id, ["department", "employee_name", "company", "user_id"]);
            if (r && r.message) {
                const emp = r.message;
                if (emp.department) this.dialog.set_value("department", emp.department);
                if (emp.employee_name) this.dialog.set_value("requested_by_fullname", emp.employee_name);
                if (emp.company) this.dialog.set_value("company", emp.company);
                if (emp.user_id) this.dialog.set_value("requested_by", emp.user_id);
            }
        } catch (e) {
            // pass
        }
    }

    mount_wizard_bar() {
        const $modal_body = this.dialog.$wrapper.find(".modal-body");
        const id = "cr_dlg_wizard_bar";
        if ($modal_body.find(`#${id}`).length) return;

        const $bar = $(`
            <div id="${id}" style="margin: 0 0 16px 0;">
                <ol class="cr-wiz-pills" id="cr_dlg_pills">
                    ${this.steps.map((s, idx) => `
                        <li>
                            <button type="button" class="${idx === 0 ? 'cur' : ''}" data-step-pill="${idx}">
                                <span>${idx + 1}</span>
                                ${s.label}
                            </button>
                        </li>
                    `).join('')}
                </ol>
                <div>
                    <span id="cr_dlg_step_tag" style="display:inline-block; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#111827; background:#f3f4f6; border:1px solid #e5e7eb; padding:2px 8px; border-radius:4px; font-weight:800;">
                        STEP 1 OF 7
                    </span>
                    <h3 id="cr_dlg_wiz_title" style="margin:2px 0 2px 0; font-size:17px; font-weight:700; color:var(--text-color);">
                        ${this.steps[0].title}
                    </h3>
                    <p id="cr_dlg_wiz_help" style="margin:0; font-size:12.5px; color:var(--text-muted);">
                        ${this.steps[0].help}
                    </p>
                </div>
            </div>
        `);

        $modal_body.prepend($bar);

        $bar.find('[data-step-pill]').on('click', (e) => {
            const target_step = parseInt($(e.currentTarget).attr('data-step-pill'));
            if (target_step < this.step) {
                this.step = target_step;
                this.render_step();
            }
        });
    }

    mount_footer_buttons() {
        const $modal_body = this.dialog.$wrapper.find(".modal-body");
        const id = "cr_dlg_wizard_footer";
        if ($modal_body.find(`#${id}`).length) return;

        const $footer = $(`
            <div id="${id}" style="
                position: relative;
                clear: both;
                margin-top: 20px;
                padding: 16px 0 0 0;
                border-top: 1px solid var(--border-color);
            ">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <button type="button" class="btn btn-default btn-sm" data-wiz="prev">← Previous</button>
                        <span id="cr_dlg_foot_step" style="margin-left:12px; font-size:12px; color:var(--text-muted);">
                            Step 1 of 7
                        </span>
                    </div>
                    <div>
                        <button type="button" class="btn btn-primary btn-sm" data-wiz="next" style="color: #ffffff !important;">Next →</button>
                        <button type="button" class="btn btn-success btn-sm" data-wiz="finish" style="color: #ffffff !important;">
                            ✔ Submit
                        </button>
                    </div>
                </div>
            </div>
        `);

        $modal_body.append($footer);

        $footer.on("click", '[data-wiz="prev"]', () => this.prev_step());
        $footer.on("click", '[data-wiz="next"]', () => this.next_step());
        $footer.on("click", '[data-wiz="finish"]', () => this.finish());
    }

    bind_change_events() {
        // Priority score update on rating change
        const update_priority = () => {
            const parse_val = (v) => {
                if (!v) return null;
                try {
                    return parseInt(String(v).split("-")[0].trim()) || null;
                } catch (e) {
                    return null;
                }
            };

            const i = parse_val(this.dialog.get_value("impact_rating"));
            const u = parse_val(this.dialog.get_value("urgency_rating"));
            const r = parse_val(this.dialog.get_value("reach_rating"));

            if (i === null && u === null && r === null) return;

            const iv = i || 3;
            const uv = u || 3;
            const rv = r || 3;
            const mv = this.dialog.get_value("is_mandatory") ? 6 : 0;

            const raw = iv * 3 + uv * 3 + rv * 2 + mv;
            const score = Math.max(0, Math.min(100, Math.round((raw / 46.0) * 100)));

            let priority = "Low";
            if (score >= 75) priority = "Critical";
            else if (score >= 55) priority = "High";
            else if (score >= 35) priority = "Normal";
            else priority = "Low";

            this.dialog.set_value("priority_score", score);
            this.dialog.set_value("priority", priority);
        };

        const toggle_mandatory_reason = (val) => {
            const is_mand = val !== undefined ? !!val : !!this.dialog.get_value("is_mandatory");
            const f_reason = this.dialog.fields_dict.mandatory_reason;
            if (f_reason) {
                f_reason.df.hidden = is_mand ? 0 : 1;
                f_reason.df.reqd = is_mand ? 1 : 0;
                f_reason.df.hidden_due_to_dependency = false;
                const $w = f_reason.$wrapper || $(f_reason.wrapper);
                if ($w && $w.length) {
                    if (is_mand) {
                        $w.removeClass("hide hide-control d-none").show().css({ display: "block" });
                    } else {
                        $w.addClass("hide hide-control").hide().css({ display: "none" });
                    }
                }
                if (f_reason.refresh) f_reason.refresh();
                if (is_mand && $w && $w.length) {
                    $w.removeClass("hide hide-control d-none").show().css({ display: "block" });
                }
            }
        };

        const f_imp = this.dialog.fields_dict.impact_rating;
        const f_urg = this.dialog.fields_dict.urgency_rating;
        const f_rea = this.dialog.fields_dict.reach_rating;
        const f_man = this.dialog.fields_dict.is_mandatory;

        if (f_imp && f_imp.$input) f_imp.$input.on("change", update_priority);
        if (f_urg && f_urg.$input) f_urg.$input.on("change", update_priority);
        if (f_rea && f_rea.$input) f_rea.$input.on("change", update_priority);

        if (f_man) {
            const handle_man = () => {
                setTimeout(() => {
                    const is_checked = f_man.$input ? f_man.$input.is(":checked") : !!this.dialog.get_value("is_mandatory");
                    this.dialog.set_value("is_mandatory", is_checked ? 1 : 0);
                    update_priority();
                    toggle_mandatory_reason(is_checked);
                }, 10);
            };
            if (f_man.$input) f_man.$input.on("change click input", handle_man);
            if (f_man.$wrapper) f_man.$wrapper.on("change click input", "input", handle_man);
            f_man.df.onchange = handle_man;
        }

        // Employee change listener
        const f_emp = this.dialog.fields_dict.employee;
        if (f_emp && f_emp.$input) {
            f_emp.$input.on("change", () => {
                this.on_employee_change(this.dialog.get_value("employee"));
            });
        }
    }

    render_step() {
        const current = this.steps[this.step];

        // Hide all fields across all steps
        this.steps.forEach((s) => {
            s.fieldnames.forEach((fn) => {
                const f = this.dialog.fields_dict[fn];
                if (f) {
                    f.df.hidden = 1;
                    f.df.hidden_due_to_dependency = false;
                    const $w = f.$wrapper || $(f.wrapper);
                    if ($w && $w.length) {
                        $w.addClass("hide hide-control").hide().css({ display: "none" });
                    }
                }
            });
        });

        // Show only current step fields
        current.fieldnames.forEach((fn) => {
            const f = this.dialog.fields_dict[fn];
            if (f) {
                if (fn === "mandatory_reason") {
                    const is_mand = !!this.dialog.get_value("is_mandatory");
                    f.df.hidden = is_mand ? 0 : 1;
                    f.df.reqd = is_mand ? 1 : 0;
                    f.df.hidden_due_to_dependency = false;
                    const $w = f.$wrapper || $(f.wrapper);
                    if ($w && $w.length) {
                        if (is_mand) {
                            $w.removeClass("hide hide-control d-none").show().css({ display: "block" });
                        } else {
                            $w.addClass("hide hide-control").hide().css({ display: "none" });
                        }
                    }
                    if (f.refresh) f.refresh();
                    if (is_mand && $w && $w.length) {
                        $w.removeClass("hide hide-control d-none").show().css({ display: "block" });
                    }
                    return;
                }
                f.df.hidden = 0;
                f.df.hidden_due_to_dependency = false;
                const $w = f.$wrapper || $(f.wrapper);
                if ($w && $w.length) {
                    $w.removeClass("hide hide-control d-none").show().css({ display: "" });
                }
                if (f.refresh) f.refresh();
                if ($w && $w.length) {
                    $w.removeClass("hide hide-control d-none").show().css({ display: "" });
                }
            }
        });

        // Update pills
        const pills = this.dialog.$wrapper.find('#cr_dlg_pills button');
        pills.each((idx, btn) => {
            const $btn = $(btn);
            $btn.removeClass('cur done');
            if (idx < this.step) $btn.addClass('done');
            else if (idx === this.step) $btn.addClass('cur');
        });

        // Update header texts
        this.dialog.$wrapper.find("#cr_dlg_step_tag").text(`STEP ${this.step + 1} OF ${this.steps.length}`);
        this.dialog.$wrapper.find("#cr_dlg_wiz_title").text(current.title);
        this.dialog.$wrapper.find("#cr_dlg_wiz_help").text(current.help);

        // Update footer
        const is_first = this.step === 0;
        const is_last = this.step === this.steps.length - 1;

        const $footer = this.dialog.$wrapper.find("#cr_dlg_wizard_footer");
        $footer.find('[data-wiz="prev"]').toggle(!is_first);
        $footer.find('[data-wiz="next"]').toggle(!is_last);
        $footer.find('[data-wiz="finish"]').toggle(is_last);
        $footer.find('#cr_dlg_foot_step').text(`Step ${this.step + 1} of ${this.steps.length}`);

        // If on the last step (Review & submit), render the review card
        if (is_last) {
            this.render_review_card();
        }

        const modal_body = this.dialog.$wrapper.find(".modal-body")[0];
        if (modal_body) modal_body.scrollTop = 0;
    }

    render_review_card() {
        const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";
        const get_val = (fn) => {
            const f = this.dialog.fields_dict[fn];
            if (!f) return "";
            if (f.get_value) {
                const val = f.get_value();
                if (val !== undefined && val !== null) return val;
            }
            return f.value || "";
        };

        const type = get_val("type") || "—";
        const company = get_val("company") || "—";
        const dept = get_val("department") || "—";
        const req_name = get_val("requested_by_fullname") || get_val("requested_by") || "—";
        const requester_line = `${req_name} · ${dept} · ${company}`;
        const system = get_val("system_affected") || "ERP";
        const title = get_val("title") || "—";
        const desc = get_val("change_description") || "—";
        const today_proc = get_val("current_process") || "—";
        const benefit = get_val("expected_benefit") || "—";

        const users = get_val("users_count") || "0";
        const freq = get_val("frequency") || "Daily";
        const hours = get_val("hours_spent_per_week");
        const size_line = `${users} users · ${freq}${hours ? ' · ' + hours + ' h/week today' : ''}`;

        const is_mandatory = get_val("is_mandatory");
        const mand_reason = get_val("mandatory_reason") || "—";

        const score = get_val("priority_score") || 0;
        const priority = get_val("priority") || "Normal";

        const parse_val = (val) => {
            try { return parseInt(String(val).split("-")[0].trim()) || 3; } catch (e) { return 3; }
        };
        const impact = parse_val(get_val("impact_rating"));
        const urgency = parse_val(get_val("urgency_rating"));
        const reach = parse_val(get_val("reach_rating"));

        const effort = get_val("effort_days");
        const dev = get_val("developer") || "Unassigned";
        const tgt = get_val("target_delivery_date");
        const ot_hours = get_val("planned_overtime_hours") || 0;
        const assessment_line = effort ? `${effort} days · ${dev} · target ${tgt || '—'} · planned overtime ${ot_hours} h` : "Pending Enterprise Solutions assessment";

        const html = `
            <div style="
                background: var(--card-bg, #ffffff);
                border: 1px solid var(--border-color, #d1d8dd);
                border-radius: 8px;
                overflow: hidden;
                margin-top: 10px;
            ">
                <div style="padding: 10px 14px; border-bottom: 1px solid var(--border-color, #d1d8dd); background: var(--bg-light-gray, #f8fafc);">
                    <h5 style="margin: 0; font-size: 13px; font-weight: 700; color: var(--text-color);">
                        ${__("Review Request Details")}
                    </h5>
                </div>
                <table class="table table-bordered" style="margin: 0; font-size: 13px;">
                    <tbody>
                        <tr><td style="width: 170px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Type</td><td><b>${frappe.utils.escape_html(type)}</b></td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Requester</td><td>${frappe.utils.escape_html(requester_line)}</td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">System</td><td>${frappe.utils.escape_html(system)}</td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Title</td><td><b>${frappe.utils.escape_html(title)}</b></td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">What is Needed</td><td>${frappe.utils.escape_html(desc)}</td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Today</td><td>${frappe.utils.escape_html(today_proc)}</td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Benefit</td><td>${frappe.utils.escape_html(benefit)}</td></tr>
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Size</td><td>${frappe.utils.escape_html(size_line)}</td></tr>
                        ${is_mandatory ? `<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Mandatory Reason</td><td>${frappe.utils.escape_html(mand_reason)}</td></tr>` : ''}
                        <tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Priority Score</td><td>
                            <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:4px;">
                                <b style="font-size:15px; color:#111827;">${score} / 100</b>
                                <span class="indicator ${priority === 'Critical' || priority === 'High' ? 'red' : priority === 'Normal' ? 'orange' : 'green'}">${priority}</span>
                                ${is_mandatory ? '<span class="indicator red">Mandatory</span>' : ''}
                            </div>
                            <div style="height:6px; background:var(--border-color, #ebf0f5); border-radius:3px; overflow:hidden; max-width:380px;">
                                <div style="height:100%; width:${score}%; background:#2563eb; border-radius:3px;"></div>
                            </div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Impact ${impact} · Urgency ${urgency} · Reach ${reach}</div>
                        </td></tr>
                        ${has_erp_head || effort ? `<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Assessment</td><td>${frappe.utils.escape_html(assessment_line)}</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
        `;

        const rf = this.dialog.fields_dict.review_html;
        if (rf) {
            const $wrap = rf.$wrapper || $(rf.wrapper);
            if ($wrap) $wrap.html(html);
        }
    }

    validate_current_step() {
        // Last step (Review & submit) has no input validation
        if (this.step === this.steps.length - 1) return true;

        const current = this.steps[this.step];
        for (const fn of current.fieldnames) {
            const f = this.dialog.fields_dict[fn];
            if (!f || !f.df) continue;
            if (["Section Break", "Column Break", "HTML"].includes(f.df.fieldtype)) continue;

            const val = f.get_value ? f.get_value() : f.value;
            if (f.df.reqd && !val) {
                frappe.msgprint(`Please fill <b>${f.df.label}</b>`);
                return false;
            }
        }

        if (this.dialog.get_value("is_mandatory") && !this.dialog.get_value("mandatory_reason") && current.fieldnames.includes("mandatory_reason")) {
            frappe.msgprint(__("Please fill <b>Mandatory Reason</b>"));
            return false;
        }

        return true;
    }

    prev_step() {
        if (this.step > 0) {
            this.step--;
            this.render_step();
        }
    }

    next_step() {
        if (!this.validate_current_step()) return;

        if (this.step < this.steps.length - 1) {
            this.step++;
            this.render_step();
        }
    }

    finish() {
        const get_val = (fn) => {
            const f = this.dialog.fields_dict[fn];
            if (!f) return "";
            if (f.get_value) {
                const val = f.get_value();
                if (val !== undefined && val !== null) return val;
            }
            return f.value || "";
        };

        frappe.call({
            method: "genie.utils.support.create_change_request",
            type: "POST",
            args: {
                title: get_val("title"),
                cr_type: get_val("type"),
                system_affected: get_val("system_affected") || "ERP",
                company: get_val("company"),
                department: get_val("department"),
                employee: get_val("employee"),
                user: get_val("requested_by"),
                user_fullname: get_val("requested_by_fullname"),
                change_description: get_val("change_description"),
                current_process: get_val("current_process"),
                expected_benefit: get_val("expected_benefit"),
                business_justification: get_val("expected_benefit"),
                users_count: get_val("users_count"),
                frequency: get_val("frequency"),
                hours_spent_per_week: get_val("hours_spent_per_week"),
                reference_documents: get_val("reference_documents"),
                attachments: get_val("attachments"),
                impact_rating: get_val("impact_rating"),
                urgency_rating: get_val("urgency_rating"),
                reach_rating: get_val("reach_rating"),
                is_mandatory: get_val("is_mandatory") ? 1 : 0,
                mandatory_reason: get_val("mandatory_reason"),
                needed_by: get_val("needed_by"),
                reason_for_date: get_val("reason_for_date"),
                effort_days: get_val("effort_days"),
                developer: get_val("developer"),
                target_delivery_date: get_val("target_delivery_date"),
                planned_overtime_hours: get_val("planned_overtime_hours"),
                solution_approach: get_val("solution_approach"),
            },
            freeze: true,
            freeze_message: __("Submitting Change Request..."),
            callback: (r) => {
                if (!r.exc && r.message) {
                    const cr_id = r.message;
                    frappe.show_alert({
                        indicator: "green",
                        message: __(`Change Request created successfully (${cr_id})`)
                    });
                    this.dialog.hide();
                    frappe.set_route("Form", "Change Request", cr_id);
                }
            }
        });
    }
};
