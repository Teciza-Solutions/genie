# Copyright (c) 2023, Wahni IT Solutions Pvt. Ltd.
# For license information, please see license.txt

import frappe
import json

from frappe.utils import cint, flt, get_url, now
from frappe.utils.safe_exec import get_safe_globals, safe_eval

from genie.utils.requests import make_request


@frappe.whitelist()
def create_ticket(
	title,
	description,
	screen_recording=None,
	user=None,
	user_fullname=None,
	priority="Low",
	file_attachment=None,
	department=None,
):
	"""Create ticket in Opero Support Portal"""
	settings = frappe.get_cached_doc("Genie Settings")
	headers = {
		"Authorization": f"token {settings.get_password('support_api_token')}",
	}

	roles = frappe.get_roles(user)
	is_department_head = "HOD" in roles or "Department Head" in roles

	ensure_portal_user(settings, headers, user, user_fullname, department, is_department_head)

	attachments = []

	if screen_recording:
		screen_recording = f"{get_url()}{screen_recording}"

		file_data = make_request(
			url=f"{settings.support_url.rstrip('/')}/api/method/upload_file",
			headers=headers,
			payload={"file_url": screen_recording},
		).get("message")

		attachments.append(file_data)

	if file_attachment:
		file_attachment = f"{get_url()}{file_attachment}"

		file_data = make_request(
			url=f"{settings.support_url.rstrip('/')}/api/method/upload_file",
			headers=headers,
			payload={"file_url": file_attachment},
		).get("message")

		attachments.append(file_data)

	response = make_request(
		url=f"{settings.support_url.rstrip('/')}/api/method/opero.api.ticket.create_opero_ticket",
		headers=headers,
		payload={
			"doc": {
				"description": description,
				"subject": title,
				"priority": priority,
				"raised_by": user,
				"raised_by_user": user,
				"user_fullname": user_fullname,
				"customer": settings.hd_customer,
				"department": department,
				"ticket_type": "Support",
				**generate_ticket_details(settings),
			},
			"attachments": attachments,
		},
	)

	return response.get("message")


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
