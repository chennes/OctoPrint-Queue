/*
 * View model for OctoPrint-Queue
 *
 * Author: Chris Hennes
 * License: AGPLv3 
 */
$(function() {
    function QueueViewModel(parameters) {
        var self = this;
        self.loginState = parameters[0];
        self.global_settings = parameters[1];
        self.users = parameters[2];
        self.files = parameters[3];

        self.isPrinting = ko.observable(undefined);
        self.itemForEditing = ko.observable();
        self.addingNew = ko.observable();
        self.itemForArchiving = ko.observable();

        self.startingUp = ko.observable(true);
        self.requestingData = ko.observable(false);
        self.queueIsEmpty = ko.observable(true);

        self.printtypes = ko.observableArray();

        var QueueItem = function(data) {
            this.id = ko.observable();
            this.staff = ko.observable();
            this.customer = ko.observable();
            this.contact = ko.observable();
            this.filename = ko.observable();
            this.cost = ko.observable();
            this.note = ko.observable();

            this.archived = ko.observable();
            this.prepaid = ko.observable();
            this.printtype = ko.observable();
            this.submissiontimestamp = ko.observable();

            this.archivedBool = ko.pureComputed(function() {
                return this.archived() == 1;
            }, this);
            this.prepaidBool = ko.pureComputed(function() {
                return this.prepaid() == 1;
            }, this);
            this.filenameString = ko.pureComputed(function() {
                var c = this.filename().split(":");
                return c.length > 1? c[1]:c[0];
            }, this);
            this.printtypeString = ko.computed({
                read: function() {
                    if (self.printtypes().length > this.printtype()) {
                        return self.printtypes()[this.printtype()];
                    } else {
                        return "";
                    }
                }, 
                write: function (value) {
                    this.printtype (self.printtypes().findIndex(x => x == value));
                }
            }, this);
            this.timeAgo = ko.pureComputed(function() {
                var ms = Date.parse(this.submissiontimestamp()+"Z");
                var s = ms / 1000.0;
                return formatTimeAgo(s);
            }, this);

            this.update(data);
        }

        QueueItem.prototype.update = function (data) {
            var updateData = data || {};
            this.id (updateData.id || 0);  
            this.staff (updateData.staff || "");  
            this.customer (updateData.customer || "");  
            this.contact (updateData.contact || "");  
            this.filename (updateData.filename || "");  
            this.cost (updateData.cost || 0.0);  
            this.note (updateData.note || "");  

            this.archived (updateData.archived || false);  
            this.prepaid (updateData.prepaid || false);  
            this.printtype (updateData.printtype);  
            this.submissiontimestamp (updateData.submissiontimestamp || 0);
        }

        self.onQueueTab = false;
        self.dataIsStale = true;
        self.pureData = {};

        self.onStartup = function () {
            self.editDialog = $("#edit_dialog");
            self.editDialog.on('hidden', self.onCancelEdit);
            self.archiveDialog = $("#archive_dialog");
            self.archiveDialog.on('hidden', self.onCancelArchive);
        }

        self.onBeforeBinding = function () {
            self.settings = self.global_settings.settings.plugins.queue;
            self.pullPrintTypesFromStorage();
        }

        self.onAfterTabChange = function(current, previous) {
            self.onQueueTab = current == "#tab_plugin_queue";
        }

        self.onEventFileAdded = function(payload) {
            self.showAddDialog();
            self.itemForEditing().filename(payload.storage + ":" + payload.path);
        }

        self.fromCurrentData = function(data) {
            var isPrinting = data.state.flags.printing;

            if (isPrinting != self.isPrinting()) {
                self.requestData();
            }
            self.isPrinting(isPrinting);
        }

        self.requestData = function(params) {
            var force = false;
            if (_.isObject(params)) {
                force = params.force;
            }
            if (self.requestingData()) {
                return;
            }
            var icon = $(".icon-refresh");
            icon.addClass("icon-spinner icon-spin");
            if (!self.onQueueTab) {
                self.dataIsStale = true;
                return;
            }
            self.requestingData(true);
            $.ajax({
                url: "plugin/queue/queue",
                type: "GET",
                data: {force: force},
                dataType: "json",
                success: self.fromResponse
            }).always(function () {
                self.requestingData(false);
                self.startingUp(false); // Don't mark this as false until we've actually gotten a request sent off
                icon.removeClass("icon-spinner icon-spin");
            });
        }

        self.fromResponse = function(data) {
            var dataRows = ko.utils.arrayMap(data.queue, function (data) {
                return new QueueItem(data);
            });
            self.pureData = data.queue;
            self.dataIsStale = false;
            self.queueIsEmpty(true);
            for (var row = 0; row < dataRows.length; row++) {
                if (dataRows[row].archived() == false) {
                    self.queueIsEmpty(false);
                }
            }
            self.listHelper.updateItems(dataRows);
        }

        self.showArchiveDialog = function(data) {
            if (self.archiveDialog) {
                self.itemForArchiving(data);
                self.archiveDialog.modal("show");
            }
        }

        self.toggleArchive = function(data) {
             var payload = {
                id: self.itemForArchiving().id(),
                archived: (self.itemForArchiving().archived()==0?1:0)
            };

            $.ajax({
                url: "plugin/queue/archive",
                type: "PUT",
                data: JSON.stringify(payload),
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                success: self.archiveCompleted
            }).always(function() {/*TODO: Remove the spinner once it exists*/});
        }

        self.archiveCompleted = function(data) {
            self.fromResponse(data);
            self.archiveDialog.modal("hide");
        }

        self.addToQueue = function(event) {
            var payload = {
                staff: self.itemForEditing().staff(),
                customer: self.itemForEditing().customer(),
                contact: self.itemForEditing().contact(),
                filename: self.itemForEditing().filename(),
                note: self.itemForEditing().note(),
                cost: self.itemForEditing().cost(),
                prepaid: self.itemForEditing().prepaid(),
                printtype: self.itemForEditing().printtype(),
                archived: 0 
            };

            $.ajax({
                url: "plugin/queue/addtoqueue",
                type: "PUT",
                data: JSON.stringify(payload),
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                success: self.addedToQueue
            }).always(function() {/*TODO: Remove the spinner once it exists*/});
        }

        self.addedToQueue = function(data) {
            self.fromResponse(data);
            self.editDialog.modal("hide");
        }

        self.loadFile = function(queueItem) {
            var data = {};
            var components = queueItem.filename().split(":");
            if (components.length == 1) { 
                data.origin = "local";
                data.path = components[0];
            } else {
                data.origin = components[0];
                data.path = components[1];
            }
            self.files.loadFile(data);    
        }

        self.showAddDialog = function() {
            if (self.editDialog) {
                var data
                self.itemForEditing(new QueueItem());
                self.addingNew(true);
                self.editDialog.modal("show");
            }
        }

        self.modifyQueueItem = function(event) {
            var payload = {
                id: self.itemForEditing().id(),
                staff: self.itemForEditing().staff(),
                customer: self.itemForEditing().customer(),
                contact: self.itemForEditing().contact(),
                filename: self.itemForEditing().filename(),
                note: self.itemForEditing().note(),
                cost: self.itemForEditing().cost(),
                prepaid: self.itemForEditing().prepaid(),
                archived: self.itemForEditing().archived(),
                printtype: self.itemForEditing().printtype()
            };

            $.ajax({
                url: "plugin/queue/modifyitem",
                type: "PUT",
                data: JSON.stringify(payload),
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                success: self.addedToQueue
            }).always(function() {/*TODO: Remove the spinner once it exists*/});
        }

        self.showEditDialog = function(data) {
            if (self.editDialog) {
                self.itemForEditing(data);
                self.addingNew(false);
                self.editDialog.modal("show");
            }
        }

        self.onCancelEdit = function() {
            /* Force a re-fetch from the database to overwrite the local changes that we don't want to save. */
            self.dataIsStale = true;
            self.requestData();
        }

        self.onCancelArchive = function() {
        }

        
        /* ### Settings ### */

        self.pullPrintTypesFromStorage = function() {
            self.printtypes.removeAll();
            for (var i = 0; i < self.settings.printtypes().length; i++) {
                self.printtypes.push (self.settings.printtypes()[i]);
            }
        }

        self.pushPrintTypesToStorage = function() {
            var inputPrintTypeElements = $(".printTypeEntry")
            var inputPrintTypes = [];
            for (var i = 0; i < inputPrintTypeElements.length; i++) {
                inputPrintTypes.push(inputPrintTypeElements[i].value);
            }
            self.updatePrintTypes (inputPrintTypes);
        }

        self.addNewPrintType = function() {
            self.printtypes.push("Untitled");
        };

        self.removePrintType = function(printtype) {
            var currentPosition = self.printtypes.indexOf(printtype);
            self.printtypes.splice(currentPosition,1);
        };

        self.movePrintTypeUp = function(printtype) {
            var currentPosition = self.printtypes.indexOf(printtype);
            if (currentPosition > 0) {
                self.printtypes.splice(currentPosition-1,0,self.splice(currentPosition,1)[0]);
            }
        };

        self.movePrintTypeDown = function(printtype) {
            var currentPosition = self.printtypes.indexOf(printtype);
            if (currentPosition < self.printtypes().length-1) {
                self.printtypes.splice(currentPosition+1,0,self.splice(currentPosition,1)[0]);
            }
        };

        self.onSettingsBeforeSave = function () {
            var inputPrintTypeElements = $(".printTypeEntry")
            var inputPrintTypes = [];
            for (var i = 0; i < inputPrintTypeElements.length; i++) {
                inputPrintTypes.push(inputPrintTypeElements[i].value);
            }
            self.printtypes.removeAll();
            self.settings.printtypes().length = 0;
            for (var i = 0; i < inputPrintTypes.length; i++) {
                self.printtypes.push (inputPrintTypes[i]);
                self.settings.printtypes().push (inputPrintTypes[i]);
            }
        }

        self.onSettingsHidden = function () {
            self.pullPrintTypesFromStorage();
        }

        /* ItemListHelper is provided by Octoprint in helpers.js */
        self.listHelper = new ItemListHelper(
            "queueItems",
            {
                "typeThenDate": function (a,b) {
                    if (a.printtype() < b.printtype()) {
                        return -1;
                    } else if (a.printtype() > b.printtype()) {
                        return 1;
                    } else {
                        if (a.submissiontimestamp() < b.submissiontimestamp()) {
                            return -1;
                        } else if (a.submissiontimestamp() > b.submissiontimestamp()) {
                            return 1;
                        }
                    }
                    return 0;
                },
                "dateOnly": function (a,b) {
                    if (a.submissiontimestamp() < b.submissiontimestamp()) {
                        return -1;
                    } else if (a.submissiontimestamp() > b.submissiontimestamp()) {
                        return 1;
                    }
                    return 0;
                }
            },/*supportedSorting*/
            {
                "queue": function (item) {
                    return (item.archived() == 0);
                },
                "archive": function (item) {
                    return (item.archived() == 1);
                }
            },/*supportedFilters*/
            "typeThenDate", /*defaultSorting*/
            ["queue"], /*defaultFilter*/
            [["queue","archive"]], /*exclusiveFilters*/
            25 /*defaultPageSize*/ );

        self.typeThenDateSort = function() {
            self.listHelper.changeSorting("typeThenDate");
        }

        self.dateOnlySort = function() {
            self.listHelper.changeSorting("dateOnly");
        }

    }

    /* view model class, parameters for constructor, container to bind to
     * Please see http://docs.octoprint.org/en/master/plugins/viewmodels.html#registering-custom-viewmodels for more details
     * and a full list of the available options.
     */
    OCTOPRINT_VIEWMODELS.push({
        construct: QueueViewModel,
        dependencies: [ "loginStateViewModel", "settingsViewModel", "usersViewModel", "filesViewModel" ],
        elements: ["#tab_plugin_queue", "#settings_plugin_queue" ]
    });
});
