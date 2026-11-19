# Copyright (c) 2026, Wahni IT Solutions Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate, today


class ChangeRequest(Document):
	def validate(self):
		self.normalize_dates()
		self.set_defaults()
		self.calculate_priority()

	def normalize_dates(self):
		date_fields = [
			"needed_by", "target_delivery_date", "start_date",
			"training_date", "actual_training_date", "enforced_from",
			"approved_date", "date"
		]
		for df in date_fields:
			val = getattr(self, df, None)
			if val:
				try:
					setattr(self, df, frappe.utils.getdate(val))
				except Exception:
					pass

	def set_defaults(self):
		if not self.date:
			self.date = today()
		if not self.system_affected:
			self.system_affected = "ERP"
		if not self.company:
			self.company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")

		# Auto fetch employee details for requester
		if self.requested_by and not self.employee:
			emp = frappe.db.get_value("Employee", {"user_id": self.requested_by}, ["name", "department", "employee_name", "company"], as_dict=True)
			if emp:
				self.employee = emp.name
				if not self.department:
					self.department = emp.department
				if not self.requested_by_fullname:
					self.requested_by_fullname = emp.employee_name
				if not self.company:
					self.company = emp.company
		elif self.employee and not self.department:
			emp = frappe.db.get_value("Employee", self.employee, ["department", "employee_name", "company"], as_dict=True)
			if emp:
				self.department = emp.department
				if not self.requested_by_fullname:
					self.requested_by_fullname = emp.employee_name
				if not self.company:
					self.company = emp.company

		if not self.business_justification and self.expected_benefit:
			self.business_justification = self.expected_benefit
		elif not self.expected_benefit and self.business_justification:
			self.expected_benefit = self.business_justification

	def calculate_priority(self):
		"""
		Calculate Priority Score (0-100) using the ES formula:
		raw = impact*3 + urgency*3 + reach*2 + (6 if mandatory else 0)
		score = round(raw / 46 * 100)
		>= 75: Critical, >= 55: High, >= 35: Normal, < 35: Low
		"""
		def parse_rating(val):
			if not val:
				return None
			try:
				return int(str(val).split("-")[0].strip())
			except Exception:
				return None

		impact_val = parse_rating(self.impact_rating)
		urgency_val = parse_rating(self.urgency_rating)
		reach_val = parse_rating(self.reach_rating)

		if impact_val is None and urgency_val is None and reach_val is None:
			return

		impact_val = impact_val or 3
		urgency_val = urgency_val or 3
		reach_val = reach_val or 3
		mandatory_val = 6 if self.is_mandatory else 0

		raw = impact_val * 3 + urgency_val * 3 + reach_val * 2 + mandatory_val
		score = round((raw / 46.0) * 100)
		self.priority_score = max(0, min(100, score))

		if self.priority_score >= 75:
			self.priority = "Critical"
		elif self.priority_score >= 55:
			self.priority = "High"
		elif self.priority_score >= 35:
			self.priority = "Normal"
		else:
			self.priority = "Low"

		# Keep Opero compatibility impact aligned
		if self.priority in ("Critical", "High"):
			self.impact = "High"
		elif self.priority == "Normal":
			self.impact = "Medium"
		else:
			self.impact = "Low"

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
