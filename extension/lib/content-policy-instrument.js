const Cc = require('chrome').Cc;
const Ci = require('chrome').Ci;
const Cu = require('chrome').Cu;
const components = require('chrome').components;

const data = require("self").data;
var xpcom = require('sdk/platform/xpcom');
var xpcomUtils = Cu.import('resource://gre/modules/XPCOMUtils.jsm').XPCOMUtils;
var loggingDB = require("logging-db");
var pageManager = require("page-manager");

exports.run = function() {

	// Set up logging
	var createContentPolicyTable = data.load("create_content_policy_table.sql");
	loggingDB.executeSQL(createContentPolicyTable, false);

	// Instrument content policy API
	// Provides additional information about what caused a request and what it's for
	function InstrumentContentPolicy() {}
	InstrumentContentPolicy.prototype = {
		classDescription: "Instruments the content policy API",
		contractID: "@stanford.edu/instrument-content-policy;1",
		classID: require('sdk/util/uuid').uuid(),
		QueryInterface: xpcomUtils.generateQI([Ci.nsIContentPolicy]),
		
		shouldLoad: function(contentType, contentLocation, requestOrigin, context, mimeTypeGuess, extra) {
			var update = { };
			update["content_type"] = contentType;
			update["content_location"] = loggingDB.escapeString(contentLocation.spec);
			update["request_origin"] = loggingDB.escapeString(requestOrigin ? requestOrigin.spec : "");
			update["page_id"] = -1;
			if(context) {
				var domNode = null;
				var domWindow = null;
				try { domNode = context.QueryInterface(Ci.nsIDOMNode); }
				catch(error) { }
				try { domWindow = context.QueryInterface(Ci.nsIDOMWindow); }
				catch(error) { }
				var window = null;
				if(domNode && domNode.ownerDocument && domNode.ownerDocument.defaultView)
					window = domNode.ownerDocument.defaultView;
					//document = domNode.ownerDocument;
				if(domWindow)
					window = domWindow;
				if(window) {
					update["page_id"] = pageManager.pageIDFromWindow(window);
				}
			}
			update["mime_type_guess"] = loggingDB.escapeString(mimeTypeGuess ? mimeTypeGuess : "");

			loggingDB.executeSQL(loggingDB.createInsert("content_policy", update), true);

			return Ci.nsIContentPolicy.ACCEPT;
		},
		
		// Fires infrequently, instrumentation unused
		shouldProcess: function(contentType, contentLocation, requestOrigin, context, mimeType, extra) {
			return Ci.nsIContentPolicy.ACCEPT;
		}
	};

var xpcom = require('sdk/platform/xpcom');
 
var factory = xpcom.Factory({
  contract: InstrumentContentPolicy.prototype.contractID,
  Component: InstrumentContentPolicy,
  register: false,
  unregister: false,
});

xpcom.register(factory);
/*
	xpcom.register({
		create: InstrumentContentPolicy,
		name: InstrumentContentPolicy.prototype.classDescription,
		contractID: InstrumentContentPolicy.prototype.contractID,
		uuid: InstrumentContentPolicy.prototype.classID
	});
*/
	var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
	categoryManager.addCategoryEntry("content-policy", InstrumentContentPolicy.prototype.contractID, InstrumentContentPolicy.prototype.contractID, false, false);
	
};