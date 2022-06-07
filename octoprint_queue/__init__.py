# coding=utf-8
from __future__ import absolute_import, division, print_function, unicode_literals

# A lot of this code is based on Jarek Szczepanski's Print History plugin. Thanks, Jarek!

__author__ = "Chris Hennes <chennes@pioneerlibrarysystem.org"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2019 Pioneer Library System. Released under the terms of the AGPLv3 license."
__plugin_pythoncompat__ = ">=3.0,<4"

from flask import jsonify, request, make_response
from octoprint.server.util.flask import with_revalidation_checking, check_etag, restricted_access

import octoprint.plugin
import sqlite3
import os

class QueuePlugin(octoprint.plugin.StartupPlugin,
				  octoprint.plugin.SettingsPlugin,
				  octoprint.plugin.AssetPlugin,
				  octoprint.plugin.TemplatePlugin,
				  octoprint.plugin.BlueprintPlugin):

	def __init__(self):
		self._queue_dict = None

	def on_after_startup(self):
		self._queue_db_path = os.path.join(self.get_plugin_data_folder(),"queue.db")
		connection = sqlite3.connect(self._queue_db_path)
		cursor = connection.cursor()
		creation = """\
CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submissiontimestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  staff TEXT NOT NULL DEFAULT "",
  customer TEXT NOT NULL DEFAULT "",
  contact TEXT NOT NULL DEFAULT "",
  filename TEXT NOT NULL DEFAULT "",
  note TEXT,
  printtype INTEGER,
  cost REAL,
  prepaid INTEGER,
  status INTEGER,
  archived INTEGER
);

CREATE TABLE IF NOT EXISTS modifications (
  id INTEGER NOT NULL PRIMARY KEY ON CONFLICT REPLACE,
  action TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS queue_onupdate AFTER UPDATE ON queue
BEGIN
  INSERT INTO modifications (id, action) VALUES (old.id, 'UPDATE');
END;

CREATE TRIGGER IF NOT EXISTS queue_ondelete AFTER DELETE ON queue
BEGIN
  INSERT INTO modifications (id, action) VALUES (old.id, 'DELETE');
END;

CREATE TRIGGER IF NOT EXISTS queue_oninsert AFTER INSERT ON queue
BEGIN
  INSERT INTO modifications (id, action) VALUES (new.id, 'INSERT');
END;

"""
		cursor.executescript(creation)
		connection.close()

	##~~ SettingsPlugin mixin

	def get_settings_defaults(self):
		return dict(
			printtypes=["Urgent","Customer","Student","Internal","Other"]
		)

	##~~ AssetPlugin mixin

	def get_assets(self):
		return dict(
			js=["js/queue.js"],
			css=["css/queue.css"],
			less=["less/queue.less"]
		)

	##~~ Softwareupdate hook

	def get_update_information(self):
		return dict(
			queue=dict(
				displayName="Queue Plugin",
				displayVersion=self._plugin_version,

				# version check: github repository
				type="github_release",
				user="chennes",
				repo="OctoPrint-Queue",
				current=self._plugin_version,

				# update method: pip
				pip="https://github.com/chennes/OctoPrint-Queue/archive/{target_version}.zip"
			)
		)

	
	##~~ Blueprint mixin -- basically the whole plugin
	@octoprint.plugin.BlueprintPlugin.route("/queue", methods=["GET"])
	@restricted_access
	def getQueue(self):
		from octoprint.settings import valid_boolean_trues
		force = request.values.get("force","false") in valid_boolean_trues
		if force:
			self._queue_dict = None
		def view():
			queue_dict = self._getQueueDict()
			if queue_dict is not None:
				return jsonify(queue=queue_dict)
			else:
				return jsonify({})
		def etag():
			# The etag here is used to check the modifications table, which tracks changes to the
			# queue
			connection = sqlite3.connect(self._queue_db_path)
			cursor = connection.cursor()
			cursor.execute("SELECT changed_at FROM modifications ORDER BY changed_at DESC LIMIT 1");
			last_modified = cursor.fetchone()
			connection.close()
			import hashlib
			hash = hashlib.sha1()
			hash.update(str(last_modified).encode("UTF-8"))
			return hash.hexdigest()
		def condition():
			return check_etag(etag())
		
		return with_revalidation_checking(etag_factory=lambda *args, **kwargs: etag(),
										  condition=lambda *args, **kwargs: condition(),
										  unless=lambda: force)(view)()

	@octoprint.plugin.BlueprintPlugin.route("/file", methods=["GET"])
	@restricted_access
	def getRecentFile(self):
		if self._fileAddedPayload is not None:
			payload = self._fileAddedPayload
			self._fileAddedPayload = None
			return jsonify(payload)
		else:
			return jsonify({})
	
	@octoprint.plugin.BlueprintPlugin.route("/addtoqueue", methods=["PUT"])
	@restricted_access
	def addToQueue(self):
		from werkzeug.exceptions import BadRequest
		try:
			json_data = request.json
		except BadRequest:
			return make_response("Malformed JSON body in request", 400)

		staff = json_data["staff"] if "staff" in json_data else ""  
		customer = json_data["customer"] if "customer" in json_data else ""  
		contact = json_data["contact"] if "contact" in json_data else ""  
		filename = json_data["filename"]   if "filename" in json_data else ""  
		note = json_data["note"]   if "note" in json_data else ""  
		printtype = json_data["printtype"]   if "printtype" in json_data else 0  
		cost = json_data["cost"]   if "cost" in json_data else 0.0
		prepaid = json_data["prepaid"]   if "prepaid" in json_data else 0  
		status = json_data["status"]   if "status" in json_data else 0
		archived = json_data["archived"]   if "archived" in json_data else 0  
		
		self._queue_dict = None

		connection = sqlite3.connect(self._queue_db_path)
		cursor = connection.cursor()
		cursor.execute("INSERT INTO queue (staff, customer, contact, filename, note, printtype, cost, prepaid, status, archived) VALUES (?,?,?,?,?,?,?,?,?,?)",(staff,customer,contact,filename,note,printtype,cost,prepaid,status,archived))
		connection.commit()
		connection.close()
		return self.getQueue()

	@octoprint.plugin.BlueprintPlugin.route("/archive", methods=["PUT"])
	@restricted_access
	def archive(self):
		from werkzeug.exceptions import BadRequest
		try:
			json_data = request.json
		except BadRequest:
			return make_response("Malformed JSON body in request", 400)
		if not "id" in json_data:
			return make_response("No ID in request", 400)
		itemid = json_data["id"]
		archived = json_data["archived"] if "archived" in json_data else 1  
		self._queue_dict = None
		connection = sqlite3.connect(self._queue_db_path)
		cursor = connection.cursor()
		cursor.execute("UPDATE queue SET archived=? WHERE id=?",(archived,itemid))
		connection.commit()
		connection.close()
		return self.getQueue()

	@octoprint.plugin.BlueprintPlugin.route("/modifyitem", methods=["PUT"])
	@restricted_access
	def modifyItem(self):
		from werkzeug.exceptions import BadRequest
		try:
			json_data = request.json
		except BadRequest:
			return make_response("Malformed JSON body in request", 400)
		if not "id" in json_data:
			return make_response("No ID in request", 400)
		itemid = json_data["id"]
		staff = json_data["staff"] if "staff" in json_data else ""  
		customer = json_data["customer"] if "customer" in json_data else ""  
		contact = json_data["contact"] if "contact" in json_data else ""  
		filename = json_data["filename"]   if "filename" in json_data else ""  
		note = json_data["note"]   if "note" in json_data else ""  
		printtype = json_data["printtype"]   if "printtype" in json_data else 0  
		cost = json_data["cost"]   if "cost" in json_data else 0.0
		prepaid = json_data["prepaid"]   if "prepaid" in json_data else 0  
		status = json_data["status"]   if "status" in json_data else 0
		archived = json_data["archived"] if "archived" in json_data else 1  

		self._queue_dict = None
		connection = sqlite3.connect(self._queue_db_path)
		cursor = connection.cursor()
		cursor.execute("UPDATE queue SET staff=?,customer=?,contact=?,filename=?,note=?,printtype=?,cost=?,prepaid=?,status=?,archived=? where id=?",(staff,customer,contact,filename,note,printtype,cost,prepaid,status,archived,itemid))
		connection.commit()
		connection.close()
		return self.getQueue()


		
	def _getQueueDict(self):
		if self._queue_dict is not None:
			return self._queue_dict
		connection = sqlite3.connect(self._queue_db_path)
		cursor = connection.cursor()
		cursor.execute("SELECT * FROM queue ORDER BY printtype ASC, submissiontimestamp DESC")
		queue_dict = [dict((cursor.description[i][0], value) for i,value in enumerate(row)) for row in cursor.fetchall()]
		connection.close()
		if queue_dict is None:
			queue_dict = dict()
		self._queue_dict = queue_dict
		return self._queue_dict

def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = QueuePlugin()

	global __plugin_hooks__
	__plugin_hooks__ = {
		"octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
	}

