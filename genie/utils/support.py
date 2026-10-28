# Copyright (c) 2023, Wahni IT Solutions Pvt. Ltd.
# For license information, please see license.txt

import frappe
import json

from frappe.utils import cint, flt, get_url, now
from frappe.utils.safe_exec import get_safe_globals, safe_eval

from genie.utils.requests import make_request


from frappe import _


@frappe.whitelist()
def create_ticket(
	title,
	description,
	screen_recording=None,
	user=None,
	user_fullname=None,
	priority="Low",
	ticket_type="Bug / Issue",
	file_attachment=None,
	attachments=None,
	system_info=None,
	console_logs=None,
	department=None,
):
	"""Create ticket in Opero Support Portal with rich diagnostics and media attachments"""
	settings = frappe.get_cached_doc("Genie Settings")
	if not settings.enable_ticket_raising:
		frappe.throw(_("Ticket raising is not enabled in Genie Settings."))

	if not settings.support_url or not settings.get_password("support_api_token"):
		frappe.throw(_("Support URL or API token is missing in Genie Settings."))

	user = user or frappe.session.user
	user_fullname = user_fullname or frappe.utils.get_fullname(user)

	headers = {
		"Authorization": f"token {settings.get_password('support_api_token')}",
	}

	roles = frappe.get_roles(user)
	is_department_head = "HOD" in roles or "Department Head" in roles

	ensure_portal_user(settings, headers, user, user_fullname, department, is_department_head)

	# Aggregate attachments
	all_file_urls = []
	if screen_recording:
		all_file_urls.append(screen_recording)
	if file_attachment:
		all_file_urls.append(file_attachment)

	if attachments:
		if isinstance(attachments, str):
			try:
				attachments = json.loads(attachments)
			except Exception:
				attachments = [attachments]
		if isinstance(attachments, list):
			for item in attachments:
				if isinstance(item, dict):
					url = item.get("file_url") or item.get("file")
				else:
					url = str(item)
				if url and url not in all_file_urls:
					all_file_urls.append(url)

	remote_attachments = []
	for file_url in all_file_urls:
		if not file_url:
			continue
		full_file_url = file_url if file_url.startswith("http") else f"{get_url()}{file_url}"
		try:
			file_data = make_request(
				url=f"{settings.support_url.rstrip('/')}/api/method/upload_file",
				headers=headers,
				payload={"file_url": full_file_url},
			).get("message")
			if file_data:
				remote_attachments.append(file_data)
		except Exception as e:
			frappe.log_error(title="Attachment Upload Error to Support Portal", message=str(e))

	formatted_diagnostics = format_system_info(system_info)
	formatted_console_logs = format_console_logs(console_logs)

	response = make_request(
		url=f"{settings.support_url.rstrip('/')}/api/method/opero.api.ticket.create_opero_ticket",
		headers=headers,
		payload={
			"doc": {
				"description": description,
				"system_and_environment_diagnostics": formatted_diagnostics,
				"client_error_and_console_log": formatted_console_logs,
				"subject": title,
				"priority": priority,
				"raised_by": user,
				"raised_by_user": user,
				"user_fullname": user_fullname,
				"customer": settings.hd_customer,
				"department": department,
				"ticket_type": ticket_type or "Support",
				**generate_ticket_details(settings),
			},
			"attachments": remote_attachments,
		},
	)

	ticket_id = response.get("message") if isinstance(response, dict) else response
	if isinstance(ticket_id, dict) and ticket_id.get("error"):
		frappe.throw(str(ticket_id.get("error")))

	return {
		"ticket_id": ticket_id,
		"portal_url": settings.support_url.rstrip("/"),
	}


def format_system_info(system_info):
	"""Format system and environment diagnostics into clean HTML table"""
	if not system_info:
		return ""

	if isinstance(system_info, str):
		try:
			system_info = json.loads(system_info)
		except Exception:
			return f"<pre>{frappe.utils.escape_html(str(system_info))}</pre>"

	if isinstance(system_info, dict) and system_info:
		rows_html = []
		for k, v in system_info.items():
			label = k.replace("_", " ").title()
			rows_html.append(f"""
				<tr>
					<td style="padding: 6px 12px; border: 1px solid #e2e8f0; font-weight: 600; background: #f8fafc; width: 35%;">{label}</td>
					<td style="padding: 6px 12px; border: 1px solid #e2e8f0; word-break: break-all;">{frappe.utils.escape_html(str(v))}</td>
				</tr>
			""")

		return f"""
			<table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #475569; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
				{''.join(rows_html)}
			</table>
		"""

	return ""


def format_console_logs(console_logs):
	"""Format captured console and client error logs into clean HTML cards"""
	if not console_logs:
		return ""

	logs_data = None
	if isinstance(console_logs, str):
		try:
			logs_data = json.loads(console_logs)
		except Exception:
			logs_data = None

	if isinstance(logs_data, list) and logs_data:
		error_cards = []
		for idx, err in enumerate(logs_data, 1):
			err_type = frappe.utils.escape_html(str(err.get("type", "Error")))
			err_time = frappe.utils.escape_html(str(err.get("time", "")))
			err_msg = frappe.utils.escape_html(str(err.get("message") or err.get("response") or err.get("error") or ""))
			err_stack = frappe.utils.escape_html(str(err.get("stack") or ""))

			stack_html = (
				f'<pre style="margin: 6px 0 0 0; padding: 6px; background: #fee2e2; border-radius: 4px; font-size: 10px; font-family: monospace; overflow-x: auto; white-space: pre-wrap;">{err_stack}</pre>'
				if err_stack
				else ""
			)

			error_cards.append(f"""
				<div style="margin-bottom: 8px; padding: 8px 10px; background: #fff5f5; border: 1px solid #fecaca; border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
					<div style="display: flex; justify-content: space-between; font-weight: 600; color: #991b1b; font-size: 11px;">
						<span>#{idx} [{err_type}]</span>
						<span style="color: #64748b; font-weight: 400;">{err_time}</span>
					</div>
					<div style="font-family: monospace; font-size: 11px; color: #b91c1c; margin-top: 4px; word-break: break-all;">
						{err_msg}
					</div>
					{stack_html}
				</div>
			""")

		return "".join(error_cards)

	escaped_logs = frappe.utils.escape_html(str(console_logs))
	return f'<pre style="margin: 0; padding: 12px; background: #fff5f5; color: #b91c1c; font-size: 11px; font-family: monospace; white-space: pre-wrap; word-break: break-all;">{escaped_logs}</pre>'


def ensure_portal_user(settings, headers, user, user_fullname, department, is_department_head):
	"""Ensure portal user exists in Opero"""

	if not user:
		return

	try:
		user_data = make_request(
			url=f"{settings.support_url.rstrip('/')}/api/method/opero.api.ticket.check_portal_user",
			headers=headers,
			payload={
				"email": user
			},
			req_type="GET",
		)

		if user_data.get("data"):
			return

	except Exception:
		pass


	make_request(
		url=f"{settings.support_url.rstrip('/')}/api/method/opero.api.ticket.create_portal_user",
		headers=headers,
		payload={
			"email": user,
			"first_name": user_fullname or user.split("@")[0],
			"enabled": 1,
			"customer": settings.hd_customer,
			"department": department,
			"is_department_head": is_department_head,
			"roles": [
				{"role": "Opero Ticket Raiser"}
			],
		},
		req_type="POST",
	)


def generate_ticket_details(settings):
	req_params = {}
	for row in settings.ticket_details:
		if row.type == "String":
			req_params[row.key] = row.value
		elif row.type == "Integer":
			req_params[row.key] = cint(row.value)
		elif row.type == "Context":
			req_params[row.key] = safe_eval(row.value, get_safe_globals(), {})
		else:
			req_params[row.key] = row.value

		if row.cast_to:
			if row.cast_to == "Int":
				req_params[row.key] = cint(req_params[row.key])
			elif row.cast_to == "String":
				req_params[row.key] = str(req_params[row.key])
			elif row.cast_to == "Float":
				req_params[row.key] = flt(req_params[row.key])

	return req_params


def upload_file(content):
	file_url = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": frappe.scrub(f"ST_{frappe.session.user}_{now()}.mp4"),
			"is_private": False,
			"content": content,
			"decode": True,
		}
	).save(ignore_permissions=True).file_url

	return f"{get_url()}{file_url}"


@frappe.whitelist()
def get_portal_url(user=frappe.session.user):
	support_url = frappe.db.get_single_value("Genie Settings", "support_url")

	try:
		return {
			"url": f"{support_url}/opero/opero/account/login"
		}

	except Exception:
		frappe.log_error(
			title="Support Portal Login Error",
			message=frappe.get_traceback(),
		)

		frappe.throw(
			"Unable to log in to the support portal. Please try again later."
		)


@frappe.whitelist()
def create_change_request(
	title,
	change_description,
	business_justification,
	cr_type="Custom",
	impact="Low",
	user=None,
	user_fullname=None,
	file_attachment=None,
	attachments=None,
	department=None,
):
	"""Create a Change Request in Genie (status: Pending)"""
	if not user:
		user = frappe.session.user
	if not user_fullname:
		user_fullname = frappe.utils.get_fullname(user)

	if isinstance(attachments, str):
		try:
			attachments = json.loads(attachments)
		except Exception:
			attachments = []

	cr_doc = frappe.get_doc({
		"doctype": "Change Request",
		"title": title,
		"type": cr_type,
		"impact": impact,
		"change_description": change_description,
		"business_justification": business_justification,
		"requested_by": user,
		"requested_by_fullname": user_fullname,
		"department": department,
		"file_attachment": file_attachment,
		"status": "Pending",
		"date": frappe.utils.today(),
	})

	if attachments and isinstance(attachments, list):
		for item in attachments:
			file_url = None
			if isinstance(item, dict):
				file_url = item.get("file")
			elif isinstance(item, str):
				file_url = item

			if file_url:
				cr_doc.append("attachments", {
					"file": file_url,
					"file_name": file_url.split("/")[-1]
				})

	cr_doc.insert(ignore_permissions=True)
	return cr_doc.name


def push_change_request_to_opero(doc):
	"""Push approved Change Request from Genie to Opero"""
	settings = frappe.get_cached_doc("Genie Settings")
	if not settings.support_url or not settings.get_password("support_api_token"):
		frappe.log_error(title="Opero Sync Error", message="Genie Settings support_url or API token is missing.")
		return None

	headers = {
		"Authorization": f"token {settings.get_password('support_api_token')}",
	}

	user = doc.requested_by or frappe.session.user
	user_fullname = doc.requested_by_fullname or doc.requested_by
	department = doc.department

	roles = frappe.get_roles(user)
	is_department_head = "HOD" in roles or "Department Head" in roles

	ensure_portal_user(settings, headers, user, user_fullname, department, is_department_head)

	attachments = []

	if doc.get("attachments"):
		for row in doc.attachments:
			if row.file:
				file_url = row.file
				if not file_url.startswith("http"):
					file_url = f"{get_url()}{file_url}"

				try:
					file_data = make_request(
						url=f"{settings.support_url.rstrip('/')}/api/method/upload_file",
						headers=headers,
						payload={"file_url": file_url},
					).get("message")
					if file_data:
						attachments.append(file_data)
				except Exception as e:
					frappe.log_error(title="File Upload Error for Change Request", message=str(e))

	if doc.file_attachment:
		file_url = doc.file_attachment
		if not file_url.startswith("http"):
			file_url = f"{get_url()}{file_url}"

		try:
			file_data = make_request(
				url=f"{settings.support_url.rstrip('/')}/api/method/upload_file",
				headers=headers,
				payload={"file_url": file_url},
			).get("message")
			if file_data:
				attachments.append(file_data)
		except Exception as e:
			frappe.log_error(title="File Upload Error for Change Request", message=str(e))

	try:
		response = make_request(
			url=f"{settings.support_url.rstrip('/')}/api/method/opero.api.change_request.create_opero_change_request",
			headers=headers,
			payload={
				"doc": {
					"project": settings.hd_customer,
					"date": str(doc.date or frappe.utils.today()),
					"type": doc.type or "Custom",
					"impact": doc.impact or "Low",
					"change_description": doc.change_description,
					"business_justification": doc.business_justification,
					"prepared_by": user,
					"status": "Open",
				},
				"attachments": attachments,
			},
		)

		opero_id = response.get("message") if isinstance(response, dict) else None
		if opero_id and isinstance(opero_id, str):
			doc.db_set("opero_cr_id", opero_id, update_modified=False)
			frappe.msgprint(f"Change Request pushed to Opero: {opero_id}")
		return opero_id
	except Exception as e:
		frappe.log_error(title="Opero Sync Error for Change Request", message=str(e))
		return None
