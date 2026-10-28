// Copyright (c) 2023, Wahni IT Solutions Pvt. Ltd. and Contributors
// MIT License. See license.txt
// Professional Support Ticket Dialog with rich diagnostics and attachment management

frappe.provide("genie");

// Global diagnostic capture for console errors, runtime exceptions, and AJAX failures
genie._recent_errors = genie._recent_errors || [];

function serializeConsoleArg(arg) {
	if (arg === null) return "null";
	if (arg === undefined) return "undefined";
	if (arg instanceof Error) {
		return `${arg.name}: ${arg.message}${arg.stack ? "\n" + arg.stack : ""}`;
	}
	if (typeof arg === "object") {
		try {
			return JSON.stringify(arg);
		} catch (e) {
			return String(arg);
		}
	}
	return String(arg);
}

function recordDiagnosticError(entry) {
	try {
		genie._recent_errors.push(entry);
		if (genie._recent_errors.length > 20) {
			genie._recent_errors.shift();
		}
	} catch (e) {
		// ignore
	}
}

if (typeof window !== "undefined" && !window._genie_error_listener_attached) {
	window._genie_error_listener_attached = true;

	// 1. Intercept console.error calls
	const originalConsoleError = console.error;
	console.error = function (...args) {
		try {
			const message = args.map(serializeConsoleArg).join(" ");
			let stack = "";
			try {
				const err = new Error();
				stack = err.stack ? err.stack.split("\n").slice(2).join("\n") : "";
			} catch (e) { }

			recordDiagnosticError({
				type: "console.error",
				message: message,
				time: new Date().toISOString(),
				stack: stack
			});
		} catch (e) { }
		originalConsoleError.apply(console, args);
	};

	// 2. Intercept uncaught runtime window error events
	window.addEventListener("error", function (event) {
		try {
			let stack = "";
			let message = event.message || "Unknown Runtime Error";
			if (event.error) {
				stack = event.error.stack || "";
				if (event.error.message) {
					message = `${event.error.name || "Error"}: ${event.error.message}`;
				}
			}

			recordDiagnosticError({
				type: "uncaught_error",
				message: message,
				filename: event.filename || "",
				lineno: event.lineno || 0,
				colno: event.colno || 0,
				time: new Date().toISOString(),
				stack: stack
			});
		} catch (e) { }
	});

	// 3. Intercept unhandled Promise rejections
	window.addEventListener("unhandledrejection", function (event) {
		try {
			const reason = event.reason;
			const message = reason instanceof Error
				? `${reason.name}: ${reason.message}`
				: serializeConsoleArg(reason);
			const stack = reason instanceof Error && reason.stack ? reason.stack : "";

			recordDiagnosticError({
				type: "unhandled_promise_rejection",
				message: message,
				time: new Date().toISOString(),
				stack: stack
			});
		} catch (e) { }
	});

	// 4. Intercept jQuery / Frappe AJAX failures
	if (window.$ && $(document).ajaxError) {
		$(document).ajaxError(function (event, jqXHR, ajaxSettings, thrownError) {
			try {
				let serverResponse = "";
				try {
					const json = JSON.parse(jqXHR.responseText);
					serverResponse = json._server_messages || json.exception || json.exc || jqXHR.responseText;
				} catch (e) {
					serverResponse = (jqXHR.responseText || "").substring(0, 500);
				}

				recordDiagnosticError({
					type: "ajax_error",
					url: ajaxSettings.url,
					status: jqXHR.status,
					statusText: jqXHR.statusText,
					message: `HTTP ${jqXHR.status} on ${ajaxSettings.url}: ${thrownError || jqXHR.statusText}`,
					response: serverResponse,
					time: new Date().toISOString()
				});
			} catch (e) { }
		});
	}
}

genie.SupportTicket = class SupportTicket {
	constructor() {
		if (!frappe.boot.genie_support_enabled) {
			frappe.msgprint(__("Ticket raising is not enabled for this site."));
			return;
		}
		this.init_config();
		this.setup_dialog();
		this.dialog.show();
	}

	init_config() {
		this.inUpload = false;
		this.attachments = [];
	}

	get_environment_info() {
		const route = frappe.get_route ? frappe.get_route_str() : window.location.pathname;
		const curForm = window.cur_frm;
		return {
			page_url: window.location.href,
			route: route || "Desk",
			doctype: curForm ? curForm.doctype : "None",
			docname: curForm ? curForm.docname : "None",
			browser: navigator.userAgent,
			screen_resolution: `${window.innerWidth}x${window.innerHeight}`,
			user_email: frappe.session.user_email || frappe.session.user,
			user_fullname: frappe.session.user_fullname || frappe.session.user,
			frappe_version: (frappe.boot.versions && frappe.boot.versions.frappe) || "v15",
			erpnext_version: (frappe.boot.versions && frappe.boot.versions.erpnext) || ""
		};
	}

	async setup_dialog() {
		const env = this.get_environment_info();

		this.dialog = new frappe.ui.Dialog({
			title: __("Raise Support Ticket"),
			size: "large",
			minimizable: true,
			static: true,
			fields: [
				{
					fieldtype: "Section Break",
					label: __("Ticket Overview")
				},
				{
					fieldname: "ticket_title",
					label: __("Subject / Summary"),
					fieldtype: "Data",
					placeholder: __("e.g. Unable to submit Sales Invoice due to validation error"),
					reqd: 1
				},
				{
					fieldname: "ticket_type",
					label: __("Ticket Type"),
					fieldtype: "Select",
					options: [
						"Bug / Issue",
						"How-to / Guidance",
						"Feature Request",
						"System Slowdown / Performance",
						"Data / Account Inquiry"
					],
					default: "Bug / Issue",
					reqd: 1
				},
				{
					fieldtype: "Column Break"
				},
				{
					fieldname: "priority",
					label: __("Priority"),
					fieldtype: "Select",
					reqd: 1,
					options: [
						{ label: __("Low - General queries"), value: "Low" },
						{ label: __("Medium - Standard issues"), value: "Medium" },
						{ label: __("High - Impaired workflow"), value: "High" },
						{ label: __("Urgent - Critical system blocker"), value: "Urgent" }
					],
					default: "Medium"
				},
				{
					fieldname: "department",
					label: __("Department"),
					fieldtype: "Link",
					options: "Department"
				},
				{
					fieldtype: "Section Break",
					label: __("Detailed Description")
				},
				{
					fieldname: "ticket_description",
					label: __("Description"),
					fieldtype: "Text Editor",
					reqd: 1
				},
				{
					fieldtype: "Section Break",
					label: __("File Attachments")
				},
				{
					fieldname: "attachments_html",
					fieldtype: "HTML"
				},
				{
					fieldname: "add_attachment_btn",
					label: __("+ Add File Attachment"),
					fieldtype: "Button",
					click: () => {
						this.prompt_file_upload();
					}
				},
				{
					fieldtype: "Section Break",
					label: __("Environment & Diagnostics"),
					collapsible: 1
				},
				{
					fieldname: "include_diagnostics",
					label: __("Include system diagnostics (Route, browser, versions)"),
					fieldtype: "Check",
					default: 1
				},
				{
					fieldname: "include_console_errors",
					label: __("Include captured browser console errors"),
					fieldtype: "Check",
					default: genie._recent_errors.length > 0 ? 1 : 0
				},
				{
					fieldname: "diagnostics_preview_html",
					fieldtype: "HTML"
				}
			],
			primary_action_label: __("Submit Ticket"),
			primary_action: (values) => {
				this.submit_ticket(values);
			},
			secondary_action_label: __("Cancel"),
			secondary_action: () => {
				this.dialog.hide();
			}
		});

		this.dialog.$wrapper.find(".modal-dialog").css("z-index", 1);
		this.dialog.get_minimize_btn().addClass("pr-3");

		this.render_attachments_list();
		this.render_diagnostics_preview(env);

		// Fetch department from Employee if available
		const r = await frappe.db.get_value("Employee", { user_id: frappe.session.user }, "department");
		if (r && r.message && r.message.department) {
			this.dialog.set_value("department", r.message.department);
		}
	}

	render_attachments_list() {
		const $wrapper = this.dialog.fields_dict.attachments_html.$wrapper;
		if (!this.attachments || this.attachments.length === 0) {
			$wrapper.html(`
				<div style="font-size: 12px; color: #94a3b8; font-style: italic; margin-bottom: 8px;">
					No files attached yet. (Screenshots, PDFs, documents, logs supported)
				</div>
			`);
			return;
		}

		const itemsHtml = this.attachments.map((file, idx) => {
			const fileName = file.file_name || file.name || file.file_url.split("/").pop();
			const safeFileName = frappe.utils.escape_html(fileName);
			const safeFileUrl = frappe.utils.escape_html(file.file_url);
			return `
				<div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; margin-bottom: 6px;">
					<div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
						<span style="font-size: 13px; color: #64748b;">📎</span>
						<a href="${safeFileUrl}" target="_blank" style="font-size: 12px; color: #2563eb; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
							${safeFileName}
						</a>
					</div>
					<button type="button" class="btn btn-xs btn-outline-danger remove-att-btn" data-idx="${idx}" style="padding: 2px 8px;">
						Remove
					</button>
				</div>
			`;
		}).join("");

		$wrapper.html(`<div style="margin-bottom: 10px;">${itemsHtml}</div>`);

		$wrapper.find(".remove-att-btn").on("click", (e) => {
			const idx = $(e.currentTarget).data("idx");
			this.attachments.splice(idx, 1);
			this.render_attachments_list();
		});
	}

	render_diagnostics_preview(env) {
		const $wrapper = this.dialog.fields_dict.diagnostics_preview_html.$wrapper;
		const safeRoute = frappe.utils.escape_html(env.route || "");
		const safeDoc = frappe.utils.escape_html(env.doctype + (env.docname !== "None" ? ` (${env.docname})` : ""));
		const safeUser = frappe.utils.escape_html(`${env.user_fullname} (${env.user_email})`);
		const safeScreen = frappe.utils.escape_html(env.screen_resolution || "");

		const errorCount = genie._recent_errors.length;
		let recentErrorSummary = "";
		if (errorCount > 0) {
			const latest = genie._recent_errors[errorCount - 1];
			const latestMsg = frappe.utils.escape_html(
				latest.message || (latest.error ? `${latest.error} (${latest.url || ""})` : "Error captured")
			);
			const latestType = frappe.utils.escape_html(latest.type || "console.error");
			recentErrorSummary = `
				<div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0; color: #b91c1c;">
					<b>${errorCount} recent console/system error(s) detected:</b>
					<div style="font-family: monospace; font-size: 10px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #fee2e2; padding: 4px 8px; border-radius: 4px;">
						[${latestType}] ${latestMsg}
					</div>
				</div>
			`;
		}

		$wrapper.html(`
			<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 11px; color: #475569;">
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
					<div><b>Current Route:</b> ${safeRoute}</div>
					<div><b>Document:</b> ${safeDoc}</div>
					<div><b>User:</b> ${safeUser}</div>
					<div><b>Screen:</b> ${safeScreen}</div>
				</div>
				${recentErrorSummary}
			</div>
		`);
	}

	prompt_file_upload() {
		new frappe.ui.FileUploader({
			folder: "Home/Genie",
			restrictions: {
				max_number_of_files: 5
			},
			on_success: (file_doc) => {
				this.attachments.push({
					file_name: file_doc.file_name,
					file_url: file_doc.file_url,
					file_size: file_doc.file_size
				});
				this.render_attachments_list();
			}
		});
	}

	submit_ticket(values) {
		if (this.inUpload) return;
		this.inUpload = true;

		const system_info = values.include_diagnostics ? this.get_environment_info() : null;
		const console_logs = values.include_console_errors && genie._recent_errors.length > 0
			? JSON.stringify(genie._recent_errors, null, 2)
			: null;

		frappe.call({
			method: "genie.utils.support.create_ticket",
			type: "POST",
			args: {
				title: values.ticket_title,
				description: values.ticket_description,
				priority: values.priority,
				ticket_type: values.ticket_type,
				attachments: this.attachments,
				department: values.department,
				user: frappe.session.user,
				user_fullname: frappe.session.user_fullname,
				system_info: system_info ? JSON.stringify(system_info) : null,
				console_logs: console_logs
			},
			freeze: true,
			freeze_message: __("Registering Support Ticket..."),
			callback: (r) => {
				this.inUpload = false;
				if (!r.exc && r.message) {
					const ticketId = (typeof r.message === "object" && r.message.ticket_id)
						? r.message.ticket_id
						: r.message;
					const portalUrl = (typeof r.message === "object" && r.message.portal_url)
						? r.message.portal_url
						: "";

					this.dialog.hide();
					frappe.show_alert({
						indicator: "green",
						message: __("Ticket #{0} raised successfully", [ticketId])
					}, 7);
					this.show_success_modal(ticketId, portalUrl);
				}
			},
			error: () => {
				this.inUpload = false;
			}
		});
	}

	show_success_modal(ticketId, portalUrl) {
		const cleanId = frappe.utils.escape_html(String(ticketId));
		const message = __(
			"Your ticket <b>#{0}</b> has been raised successfully. You will be notified once it is resolved.",
			[cleanId]
		);

		const options = {
			title: __("Ticket Created"),
			indicator: "green",
			message: message,
		};

		if (portalUrl) {
			options.primary_action = {
				label: __("Open Support Portal"),
				action: () => {
					window.open(`${portalUrl}/opero/opero/account/login`, "_blank");
				},
			};
		}

		frappe.msgprint(options);
	}
};
