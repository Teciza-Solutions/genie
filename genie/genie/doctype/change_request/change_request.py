# Copyright (c) 2026, Wahni IT Solutions Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate


class ChangeRequest(Document):
	def on_update(self):
		if self.status == "Approved" and not self.opero_cr_id:
			self.set_approved_details()
			self.push_to_opero()

	def set_approved_details(self):
		if not self.approved_by:
			self.db_set("approved_by", frappe.session.user, update_modified=False)
		if not self.approved_date:
			self.db_set("approved_date", nowdate(), update_modified=False)

	def push_to_opero(self):
		from genie.utils.support import push_change_request_to_opero
		push_change_request_to_opero(self)
