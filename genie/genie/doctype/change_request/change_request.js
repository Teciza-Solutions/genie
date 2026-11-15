// Copyright (c) 2026, Wahni IT Solutions Pvt. Ltd. and contributors
// For license information, please see license.txt

const CR_WIZARD_SKIP_SECTIONS = [
	"section_break_delivery",
	"section_break_opero",
	"Delivery, Training & Enforcement",
	"Opero Sync & Approvals"
];

const CR_WIZARD_STEPS_BASE = [
	{
		label: "Type",
		title: "What kind of request is it?",
		help: "Pick the one that fits best. Enterprise Solutions can change it later.",
		section_fieldname: "section_break_type",
		fieldnames: ["section_break_type", "type"]
	},
	{
		label: "Requester",
		title: "Who is asking?",
		help: "The company and department decide the approval track.",
		section_fieldname: "section_break_requester",
		fieldnames: [
			"section_break_requester", "system_affected", "company", "column_break_1",
			"employee", "requested_by", "requested_by_fullname", "department", "date"
		]
	},
	{
		label: "Requirement",
		title: "What is needed?",
		help: "Describe the outcome you want, not only the screen.",
		section_fieldname: "section_break_crdetail",
		fieldnames: [
			"section_break_crdetail", "title", "change_description", "current_process", "expected_benefit", "business_justification"
		]
	},
	{
		label: "Size",
		title: "How big is the problem?",
		help: "These numbers help compare requests across the group.",
		section_fieldname: "section_break_size",
		fieldnames: [
			"section_break_size", "users_count", "frequency", "column_break_size",
			"hours_spent_per_week", "reference_documents", "attachments"
		]
	},
	{
		label: "Importance",
		title: "How important is it?",
		help: "Rate it honestly. Enterprise Solutions confirms the score and it sets the request's priority.",
		section_fieldname: "section_break_priority",
		fieldnames: [
			"section_break_priority", "impact_rating", "urgency_rating", "reach_rating",
			"is_mandatory", "mandatory_reason", "column_break_prio",
			"needed_by", "reason_for_date", "priority_score", "priority"
		]
	},
	{
		label: "Assessment",
		title: "Enterprise Solutions assessment",
		help: "Approvers see this when they decide.",
		for_role: "ERP Head",
		section_fieldname: "section_break_assessment",
		fieldnames: [
			"section_break_assessment", "effort_days", "developer", "target_delivery_date",
			"planned_overtime_hours", "column_break_timeline", "start_date", "training_date", "solution_approach"
		]
	},
	{
		label: "Review & submit",
		title: "Check and submit",
		help: "Go back to any step to change it.",
		section_fieldname: null,
		fieldnames: []
	}
];

frappe.ui.form.on("Change Request", {
	onload(frm) {
		if (frm.is_new()) {
			if (!frm.doc.system_affected) {
				frm.set_value("system_affected", "ERP");
			}
			if (!frm.doc.requested_by) {
				frm.set_value("requested_by", frappe.session.user);
			}
			if (!frm.doc.requested_by_fullname) {
				frm.set_value("requested_by_fullname", frappe.session.user_fullname || frappe.session.user);
			}
			if (!frm.doc.date) {
				frm.set_value("date", frappe.datetime.get_today());
			}
			if (!frm.doc.company) {
				const def_co = frappe.defaults.get_user_default("Company") || frappe.defaults.get_default("company");
				if (def_co) frm.set_value("company", def_co);
			}

			// Auto-fetch employee and department
			cr_fetch_employee_for_user(frm, frappe.session.user);
		}
	},

	refresh(frm) {
		const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";

		frm.add_custom_button(__("Request Change Dialog"), () => {
			new genie.ChangeRequest();
		});

		if (frm.doc.docstatus !== 0) return;

		if (!frm.is_new()) {
			cr_wizard_disable_and_show_default(frm);
			cr_render_preview_tab(frm);

			// Hide assessment section from non-ERP-Head on existing doc
			if (!has_erp_head) {
				frm.toggle_display("section_break_assessment", false);
				[
					"effort_days", "developer", "target_delivery_date",
					"planned_overtime_hours", "column_break_timeline",
					"start_date", "training_date", "solution_approach"
				].forEach(fn => frm.toggle_display(fn, false));
			}

			// Mandatory reason display on existing doc
			frm.toggle_display("mandatory_reason", !!frm.doc.is_mandatory);
			frm.toggle_reqd("mandatory_reason", !!frm.doc.is_mandatory);

			// Automatically select Preview tab when user opens the doc first
			if (!frm._preview_tab_selected) {
				frm._preview_tab_selected = true;
				setTimeout(() => {
					if (frm.layout?.select_tab) {
						frm.layout.select_tab("tab_preview") || frm.layout.select_tab("Preview");
					} else if (frm.layout?.tabs?.[0]) {
						frm.layout.tabs[0].set_active();
					}
				}, 100);
			}
			return;
		}

		frm._wiz = frm._wiz || {};
		frm._wiz.step = frm._wiz.step || 0;

		if (!frm._wiz_inited) {
			frm._wiz_inited = true;
			cr_wizard_init(frm);
		}

		cr_wizard_render(frm);
		cr_wizard_hide_hidden_fields(frm);
	},

	employee(frm) {
		if (frm.doc.employee) {
			frappe.db.get_value("Employee", frm.doc.employee, ["department", "employee_name", "company", "user_id"]).then(r => {
				if (r && r.message) {
					const emp = r.message;
					if (emp.department) frm.set_value("department", emp.department);
					if (emp.employee_name) frm.set_value("requested_by_fullname", emp.employee_name);
					if (emp.company) frm.set_value("company", emp.company);
					if (emp.user_id) frm.set_value("requested_by", emp.user_id);
				}
			});
		}
	},

	requested_by(frm) {
		if (frm.doc.requested_by) {
			cr_fetch_employee_for_user(frm, frm.doc.requested_by);
		}
	},

	impact_rating(frm) {
		cr_calculate_priority(frm);
	},
	urgency_rating(frm) {
		cr_calculate_priority(frm);
	},
	reach_rating(frm) {
		cr_calculate_priority(frm);
	},
	is_mandatory(frm) {
		cr_calculate_priority(frm);
		frm.toggle_display("mandatory_reason", !!frm.doc.is_mandatory);
		frm.toggle_reqd("mandatory_reason", !!frm.doc.is_mandatory);
	}
});

/* ===============================
   Employee Fetch Helper
   =============================== */

function cr_fetch_employee_for_user(frm, user_id) {
	if (!user_id) return;
	frappe.db.get_value("Employee", { user_id: user_id }, ["name", "department", "employee_name", "company"]).then(r => {
		if (r && r.message) {
			const emp = r.message;
			if (emp.name && !frm.doc.employee) {
				frm.set_value("employee", emp.name);
			}
			if (emp.department && !frm.doc.department) {
				frm.set_value("department", emp.department);
			}
			if (emp.employee_name && !frm.doc.requested_by_fullname) {
				frm.set_value("requested_by_fullname", emp.employee_name);
			}
			if (emp.company && !frm.doc.company) {
				frm.set_value("company", emp.company);
			}
		}
	});
}

/* ===============================
   Priority Score Calculator
   =============================== */

function cr_calculate_priority(frm) {
	const parse_val = (v) => {
		if (!v) return null;
		try {
			return parseInt(String(v).split("-")[0].trim()) || null;
		} catch (e) {
			return null;
		}
	};

	const i = parse_val(frm.doc.impact_rating);
	const u = parse_val(frm.doc.urgency_rating);
	const r = parse_val(frm.doc.reach_rating);

	if (i === null && u === null && r === null) return;

	const iv = i || 3;
	const uv = u || 3;
	const rv = r || 3;
	const mv = frm.doc.is_mandatory ? 6 : 0;

	const raw = iv * 3 + uv * 3 + rv * 2 + mv;
	const score = Math.max(0, Math.min(100, Math.round((raw / 46.0) * 100)));

	let priority = "Low";
	if (score >= 75) priority = "Critical";
	else if (score >= 55) priority = "High";
	else if (score >= 35) priority = "Normal";
	else priority = "Low";

	if (frm.doc.priority_score !== score) frm.set_value("priority_score", score);
	if (frm.doc.priority !== priority) frm.set_value("priority", priority);

	const opero_impact = (priority === "Critical" || priority === "High") ? "High" : (priority === "Normal" ? "Medium" : "Low");
	if (frm.doc.impact !== opero_impact) frm.set_value("impact", opero_impact);
}

/* ===============================
   Wizard Core (7 Steps)
   =============================== */

function cr_wizard_init(frm) {
	const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";
	frm._wiz = frm._wiz || {};
	frm._wiz.step = frm.is_new() ? (frm._wiz.step || 0) : 0;
	frm._wiz.steps = CR_WIZARD_STEPS_BASE.filter(s => !s.for_role || (s.for_role === "ERP Head" && has_erp_head));

	// Hide tabs list and select details tab during wizard
	frm.$wrapper.find(".form-tabs-list").hide();
	frm.layout?.select_tab?.("tab_details");

	cr_wizard_mount_bar(frm);
	cr_wizard_mount_footer_buttons(frm);
}

/* ===============================
   Wizard Header Bar
   =============================== */

function cr_wizard_mount_bar(frm) {
	const id = "cr_wizard_bar";
	if (frm.$wrapper.find(`#${id}`).length) return;

	const $bar = $(`
		<div id="${id}" style="
			margin: 12px 0 18px 0;
			padding: 14px 18px;
			border-radius: 12px;
			background: var(--card-bg, #ffffff);
			border: 1px solid var(--border-color);
			box-shadow: 0 4px 16px rgba(0,0,0,0.05);
		">
			<div style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
				<div>
					<div id="cr_wiz_title" style="font-size:15px; font-weight:700; color:var(--text-color);"></div>
					<div id="cr_wiz_sub" style="font-size:12px; color:var(--text-muted); opacity:.8;"></div>
				</div>
				<div style="width:240px;">
					<div style="height:8px; background:var(--border-color, #ebf0f5); border-radius:99px; overflow:hidden;">
						<div id="cr_wiz_fill" style="
							height:8px;
							width:0%;
							border-radius:99px;
							background: linear-gradient(90deg, #F4C430, #FFD84D);
							transition: width .3s ease;
						"></div>
					</div>
				</div>
			</div>
		</div>
	`);

	frm.$wrapper.find(".form-layout").prepend($bar);
}

/* ===============================
   Footer Buttons
   =============================== */

function cr_wizard_mount_footer_buttons(frm) {
	const id = "cr_wizard_footer";
	if (frm.$wrapper.find(`#${id}`).length) return;

	const $footer = $(`
		<div id="${id}" style="
			position: relative;
			z-index: auto;
			clear: both;
			margin-top: 24px;
			padding: 16px 80px 16px 0;
			background: transparent;
			border-top: 1px solid var(--border-color);
		">
			<div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; align-items:center;">
				<button type="button" class="btn btn-default btn-sm" data-wiz="prev">← Previous</button>
				<button type="button" class="btn btn-primary btn-sm" data-wiz="next" style="color: #ffffff !important;">Next →</button>
				<button type="button" class="btn btn-success btn-sm" data-wiz="finish" style="color: #ffffff !important;">✔ Finish</button>
			</div>
		</div>
	`);

	$footer.find("button[data-wiz]").each(function () {
		this.style.setProperty("position", "static", "important");
		this.style.setProperty("transform", "none", "important");
		this.style.setProperty("float", "none", "important");
		this.style.setProperty("flex", "0 0 auto");
	});

	frm.$wrapper.find(".form-layout").append($footer);

	$footer.on("click", '[data-wiz="prev"]', () => cr_wizard_prev(frm));
	$footer.on("click", '[data-wiz="next"]', () => cr_wizard_next(frm));
	$footer.on("click", '[data-wiz="finish"]', () => cr_wizard_finish(frm));
}

/* ===============================
   Navigation
   =============================== */

function cr_wizard_prev(frm) {
	if (frm._wiz.step > 0) {
		frm._wiz.step--;
		cr_wizard_render(frm);
		cr_wizard_hide_hidden_fields(frm);
	}
}

async function cr_wizard_next(frm) {
	if (!cr_wizard_validate_current_step(frm)) return;

	if (frm._wiz.step < frm._wiz.steps.length - 1) {
		frm._wiz.step++;
		cr_wizard_render(frm);
		cr_wizard_hide_hidden_fields(frm);
	}
}

async function cr_wizard_finish(frm) {
	if (!cr_wizard_validate_current_step(frm)) return;

	await frm.save();
	frappe.show_alert({ message: __("Change Request Created Successfully"), indicator: "green" });
	cr_wizard_disable_and_show_default(frm);
	cr_render_preview_tab(frm);
	setTimeout(() => {
		frm.layout?.select_tab?.("tab_preview") || frm.layout?.select_tab?.("Preview");
	}, 100);
}

/* ===============================
   Render (Wizard Mode)
   =============================== */

function cr_wizard_render(frm) {
	const steps = frm._wiz.steps;
	const cur_idx = frm._wiz.step;
	const current = steps[cur_idx];
	const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";

	// Hide tab_preview during wizard
	frm.toggle_display("tab_preview", false);
	frm.toggle_display("preview_html", false);
	frm.$wrapper.find(".form-tabs-list").hide();

	// Collect all fields across steps
	const all = new Set();
	steps.forEach(s => s.fieldnames.forEach(f => all.add(f)));

	// Collect skipped section fields
	const skipped_fields = new Set();
	const fields = frm.meta.fields || [];
	let in_skipped = false;

	const skip_sections = [...CR_WIZARD_SKIP_SECTIONS];
	if (!has_erp_head) {
		skip_sections.push("section_break_assessment", "Assessment", "Enterprise Solutions assessment");
	}

	fields.forEach(df => {
		if (df.fieldtype === "Section Break") {
			const label = df.label || "";
			const fname = df.fieldname || "";
			in_skipped = skip_sections.includes(label) || skip_sections.includes(fname);
		}
		if (in_skipped && df.fieldname) {
			skipped_fields.add(df.fieldname);
		}
	});

	if (!has_erp_head) {
		[
			"section_break_assessment", "effort_days", "developer", "target_delivery_date",
			"planned_overtime_hours", "column_break_timeline", "start_date", "training_date", "solution_approach"
		].forEach(fn => skipped_fields.add(fn));
	}

	// Hide all fields
	all.forEach(f => frm.toggle_display(f, false));
	skipped_fields.forEach(f => frm.toggle_display(f, false));
	frm.toggle_display("status", false);

	// Show current step fields (if not final review step)
	if (cur_idx < steps.length - 1) {
		frm.$wrapper.find('#cr_form_review_box').remove();
		current.fieldnames.forEach(f => {
			if (f === "mandatory_reason") {
				frm.toggle_display(f, !!frm.doc.is_mandatory);
				frm.toggle_reqd(f, !!frm.doc.is_mandatory);
			} else {
				frm.toggle_display(f, true);
			}
		});
		if (current.section_fieldname) {
			auto_expand_section(frm, current.section_fieldname, true);
		}
	} else {
		// Final Review Table
		cr_wizard_render_review_card(frm);
	}

	// Header texts
	frm.$wrapper.find("#cr_wiz_title").text(current.title);
	frm.$wrapper.find("#cr_wiz_sub").text(`Step ${cur_idx + 1} of ${steps.length} · ${current.label}`);
	frm.$wrapper.find("#cr_wiz_fill").css("width", `${((cur_idx + 1) / steps.length) * 100}%`);

	// Footer buttons
	const is_first = cur_idx === 0;
	const is_last = cur_idx === steps.length - 1;

	const $footer = frm.$wrapper.find("#cr_wizard_footer");
	$footer.find('[data-wiz="prev"]').toggle(!is_first);
	$footer.find('[data-wiz="next"]').toggle(!is_last);
	$footer.find('[data-wiz="finish"]').toggle(is_last);

	window.scrollTo({ top: 0, behavior: "smooth" });
	cr_wizard_hide_hidden_fields(frm);
}

/* ===============================
   Review Table (Step 7 in Wizard)
   =============================== */

function cr_wizard_render_review_card(frm) {
	let $box = frm.$wrapper.find('#cr_form_review_box');
	if (!$box.length) {
		$box = $('<div id="cr_form_review_box" style="margin-top: 14px;"></div>');
		frm.$wrapper.find(".form-layout").append($box);
	}

	const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";
	const doc = frm.doc;
	const type = doc.type || "—";
	const company = doc.company || "—";
	const dept = doc.department || "—";
	const req_name = doc.requested_by_fullname || doc.requested_by || "—";
	const requester_line = `${req_name} · ${dept} · ${company}`;
	const system = doc.system_affected || "ERP";
	const title = doc.title || "—";
	const desc = doc.change_description || "—";
	const today_proc = doc.current_process || "—";
	const benefit = doc.expected_benefit || "—";

	const users = doc.users_count || "0";
	const freq = doc.frequency || "Daily";
	const hours = doc.hours_spent_per_week;
	const size_line = `${users} users · ${freq}${hours ? ' · ' + hours + ' h/week today' : ''}`;

	const is_mandatory = doc.is_mandatory;
	const mand_reason = doc.mandatory_reason || "—";

	const score = doc.priority_score || 0;
	const priority = doc.priority || "Normal";

	const parse_val = (val) => {
		try { return parseInt(String(val).split("-")[0].trim()) || 3; } catch (e) { return 3; }
	};
	const impact = parse_val(doc.impact_rating);
	const urgency = parse_val(doc.urgency_rating);
	const reach = parse_val(doc.reach_rating);

	const effort = doc.effort_days;
	const dev = doc.developer || "Unassigned";
	const tgt = doc.target_delivery_date;
	const ot_hours = doc.planned_overtime_hours || 0;
	const assessment_line = effort ? `${effort} days · ${dev} · target ${tgt || '—'} · planned overtime ${ot_hours} h` : "Pending Enterprise Solutions assessment";

	const html = `
		<div style="
			background: var(--card-bg, #ffffff);
			border: 1px solid var(--border-color);
			border-radius: 8px;
			overflow: hidden;
			margin-bottom: 20px;
		">
			<div style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-light-gray, #f8fafc);">
				<h5 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--text-color);">
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

	$box.html(html);
}

/* ===============================
   Preview Tab Renderer (Saved Doc)
   =============================== */

function cr_render_preview_tab(frm) {
	const field = frm.fields_dict.preview_html;
	if (!field) return;
	const $target = field.$wrapper || $(field.wrapper);
	if (!$target || !$target.length) return;

	const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";
	const doc = frm.doc;
	const type = doc.type || "—";
	const company = doc.company || "—";
	const dept = doc.department || "—";
	const req_name = doc.requested_by_fullname || doc.requested_by || "—";
	const requester_line = `${req_name} · ${dept} · ${company}`;
	const system = doc.system_affected || "ERP";
	const title = doc.title || "—";
	const desc = doc.change_description || "—";
	const today_proc = doc.current_process || "—";
	const benefit = doc.expected_benefit || "—";
	const date = doc.date || "—";

	const users = doc.users_count || "0";
	const freq = doc.frequency || "Daily";
	const hours = doc.hours_spent_per_week;
	const size_line = `${users} users · ${freq}${hours ? ' · ' + hours + ' h/week today' : ''}`;

	const is_mandatory = doc.is_mandatory;
	const mand_reason = doc.mandatory_reason || "—";

	const score = doc.priority_score || 0;
	const priority = doc.priority || "Normal";

	const parse_val = (val) => {
		try { return parseInt(String(val).split("-")[0].trim()) || 3; } catch (e) { return 3; }
	};
	const impact = parse_val(doc.impact_rating);
	const urgency = parse_val(doc.urgency_rating);
	const reach = parse_val(doc.reach_rating);

	const effort = doc.effort_days;
	const dev = doc.developer || "Unassigned";
	const tgt = doc.target_delivery_date;
	const ot_hours = doc.planned_overtime_hours || 0;
	const solution = doc.solution_approach || "—";
	const assessment_line = effort ? `${effort} days · ${dev} · target ${tgt || '—'} · planned overtime ${ot_hours} h` : "Pending Enterprise Solutions assessment";

	// Attachments list
	let attachments_html = "—";
	if (doc.attachments && doc.attachments.length) {
		attachments_html = doc.attachments.map(att => {
			const fname = att.file_name || att.file || "Attachment";
			const fpath = att.file || "#";
			return `<a href="${frappe.utils.escape_html(fpath)}" target="_blank" class="btn btn-xs btn-default" style="margin:2px 4px 2px 0;">
				<i class="fa fa-paperclip"></i> ${frappe.utils.escape_html(fname)}
			</a>`;
		}).join(" ");
	} else if (doc.file_attachment) {
		attachments_html = `<a href="${frappe.utils.escape_html(doc.file_attachment)}" target="_blank" class="btn btn-xs btn-default">
			<i class="fa fa-paperclip"></i> ${frappe.utils.escape_html(doc.file_attachment)}
		</a>`;
	}

	const status_color = {
		"Pending": "orange",
		"Approved": "green",
		"Completed": "blue",
		"Rejected": "red",
		"In Development": "purple"
	}[doc.status] || "gray";

	const html = `
		<div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
			<div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-light-gray, #f8fafc); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
				<div>
					<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
						<span class="indicator ${status_color}">${frappe.utils.escape_html(doc.status || "Pending")}</span>
						<span class="indicator ${priority === 'Critical' || priority === 'High' ? 'red' : priority === 'Normal' ? 'orange' : 'green'}">${priority}</span>
						${is_mandatory ? '<span class="indicator red">Mandatory</span>' : ''}
						<span style="font-size: 11px; color: var(--text-muted);">${frappe.utils.escape_html(doc.name || "")}</span>
					</div>
					<h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--text-color);">
						${frappe.utils.escape_html(title)}
					</h4>
				</div>
				<div>
					<button type="button" class="btn btn-default btn-sm" onclick="cur_frm.layout.select_tab('tab_details')">
						<i class="fa fa-pencil"></i> ${__("Edit Details")}
					</button>
				</div>
			</div>
			<table class="table table-bordered" style="margin: 0; font-size: 13px;">
				<tbody>
					<tr><td style="width: 180px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Type</td><td><b>${frappe.utils.escape_html(type)}</b></td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Requester</td><td>${frappe.utils.escape_html(requester_line)}</td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">System Affected</td><td>${frappe.utils.escape_html(system)}</td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Date</td><td>${frappe.utils.escape_html(date)}</td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Title</td><td><b>${frappe.utils.escape_html(title)}</b></td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">What is Needed</td><td><div style="line-height: 1.5;">${doc.change_description || "—"}</div></td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">How it Works Today</td><td>${frappe.utils.escape_html(today_proc)}</td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Expected Benefit</td><td>${frappe.utils.escape_html(benefit)}</td></tr>
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Problem Size</td><td>${frappe.utils.escape_html(size_line)}</td></tr>
					${doc.reference_documents ? `<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Reference Documents</td><td>${frappe.utils.escape_html(doc.reference_documents)}</td></tr>` : ''}
					<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Attachments</td><td>${attachments_html}</td></tr>
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
					${(has_erp_head || solution !== "—") && doc.solution_approach ? `<tr><td style="font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">Solution Approach</td><td>${frappe.utils.escape_html(solution)}</td></tr>` : ''}
				</tbody>
			</table>
		</div>
	`;

	$target.html(html);
}

/* ===============================
   Validation & Helpers
   =============================== */

function auto_expand_section(frm, fieldname, force = false) {
	if (!fieldname) return;
	const sec = frm.layout?.sections?.find(s => s.df?.fieldname === fieldname);
	if (!sec) return;
	if (!sec.df.collapsible && !force) return;

	if (sec.toggle) sec.toggle(true);
	else if (sec.collapse) sec.collapse(false);
	else $(sec.wrapper).show();
}

function cr_wizard_validate_current_step(frm) {
	if (frm._wiz.step === frm._wiz.steps.length - 1) return true; // review step has no input fields

	const current = frm._wiz.steps[frm._wiz.step];
	for (const fn of current.fieldnames) {
		const df = frm.fields_dict?.[fn]?.df;
		if (!df || ["Section Break", "Column Break"].includes(df.fieldtype)) continue;

		if (df.reqd && !frm.doc[fn]) {
			frappe.msgprint(`Please fill <b>${df.label}</b>`);
			return false;
		}
	}

	if (frm.doc.is_mandatory && !frm.doc.mandatory_reason && current.fieldnames.includes("mandatory_reason")) {
		frappe.msgprint(__("Please fill <b>Mandatory Reason</b>"));
		return false;
	}

	return true;
}

function cr_wizard_hide_hidden_fields(frm) {
	(frm.meta.fields || []).forEach(df => {
		if (!df || !df.fieldname) return;
		if (df.hidden || df.hidden === 1) {
			const f = frm.fields_dict?.[df.fieldname];
			if (f && f.wrapper) {
				$(f.wrapper).hide();
			}
		}
	});
}

function cr_wizard_disable_and_show_default(frm) {
	const has_erp_head = frappe.user.has_role("ERP Head") || frappe.session.user === "Administrator";
	frm.$wrapper.find("#cr_wizard_bar").remove();
	frm.$wrapper.find("#cr_wizard_footer").remove();
	frm.$wrapper.find("#cr_form_review_box").remove();
	frm.$wrapper.find(".form-tabs-list").show();

	(frm.meta.fields || []).forEach(df => {
		if (!df || !df.fieldname) return;
		try { frm.toggle_display(df.fieldname, true); } catch (e) {}
	});

	if (!has_erp_head) {
		frm.toggle_display("section_break_assessment", false);
		[
			"effort_days", "developer", "target_delivery_date",
			"planned_overtime_hours", "column_break_timeline",
			"start_date", "training_date", "solution_approach"
		].forEach(fn => frm.toggle_display(fn, false));
	}

	cr_wizard_hide_hidden_fields(frm);
	frm._wiz_inited = false;
}
