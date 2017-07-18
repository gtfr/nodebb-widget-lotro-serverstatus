(function(module) {
    "use strict";

    var async = require('async'),
        fs = require('fs'),
        path = require('path'),
        http = require('http'),
        url = require('url'),
        templates = module.parent.require('templates.js'),
        xml2js = require('xml2js'),
        app;

    var Widget = {
        templates: {},
    };

    var allservers = ['belegaer', 'gwaihir', 'laurelin', 'evernight', 'sirannon', 'akenstone', 'brandywine', 'bullroarer', 'gladden', 'landroval', 'crickhollow'];

    Widget.init = function(params, callback) {
        app = params.app;

        var templatesToLoad = [
            "settings.tpl",
            "widget.tpl"
        ];

        function loadTemplate(template, next) {
            fs.readFile(path.resolve(__dirname, './public/templates/' + template), function(err, data) {
                if (err) {
                    console.log(err.message);
                    return next(err);
                }
                Widget.templates[template] = data.toString();
                next(null);
            });
        }

        async.each(templatesToLoad, loadTemplate);

        callback();
    };

    Widget.renderStatusWidget = function(widget, callback) {
        console.log('[lotro-widget] renderStatusWidget called');
        var data = {
            'servers': []
        };

        async.waterfall([
            function(callback) {
                var reqUrl = {
                    protocol: 'http',
                    hostname: 'lux-hdro.de',
                    pathname: 'serverstatus-rss.php',
                    query: {}
                };

                allservers.forEach(
                    function(element, index) {
                        if (element in widget.data && widget.data[element]) {
                            reqUrl.query[element] = '1';
                        }
                    });

                var request = http.request(url.format(reqUrl));
                request.on('socket', function(socket) {
                    socket.setTimeout(4000);
                    socket.on('timeout', function() {
                        request.abort();
                    });
                });
                request.on('error', function(err) {
                    if (err.code === "ECONNRESET") {
                        console.log('[lotro-widget] Timeout on http request to lux-hdro.de');
                    }
                    widget.html = '<h4>An Error occurred:<h4><pre>' + JSON.stringify(err, null, 2) + '</pre>';
                    callback(null, widget);
                });
                request.on('response', function(res) {
                    if (res.statusCode === 200 && res.headers['content-type'] === 'text/xml') {
                        var response_data = '';
                        res.on('data', function(chunk) {
                            response_data += chunk;
                        });
                        res.on('end', function() {
                            callback(null, response_data)
                        });
                        res.on('error', function(err) {
                            console.log('[lotro-widget] Error: ' + err.message);
                            callback(err);
                        });
                    } else {
                        console.log('[lotro-widget] Error: ' + res.statusCode);
                        var err = {
                            'statusCode': res.statusCode,
                            'content-type': res.headers['content-type'],
                            'message': 'HTTP request faild',
                            'url': url.format(reqUrl)
                        }
                        callback(err);
                    }
                });
                request.end();
            },
            function(xml, callback) {
                var parser = new xml2js.Parser();
                parser.parseString(xml, function(err, result) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, result);
                    }
                });
            },
            function(json, callback) {
                json.rss.channel[0].item.forEach(
                    function(element, index) {
                        var sstatestr = element.description[0].split(',')[0],
                            sname = sstatestr.split(':')[0],
                            sstate = sstatestr.split(':')[1].trim();

                        data.servers.push({
                            'name': sname,
                            'online': (sstate == 'offen')
                        });
                    });
                callback();
            }
        ], function(err, result) {
            if (err) {
                console.log('[lotro-widget] Error: See widget content');
                widget.html = '<h4>An Error occurred:<h4><pre>' + JSON.stringify(err, null, 2) + '</pre>';
            } else {
                widget.html = templates.parse(Widget.templates['widget.tpl'], data);
            }
            callback(null, widget);
        });
    };

    Widget.defineWidget = function(widgets, callback) {
        widgets.push({
            widget: "lotro-serverstatus",
            name: "LOTRO Server Status",
            description: "Show LOTRO Server Status",
            content: Widget.templates['settings.tpl']
        });

        callback(null, widgets);
    };


    module.exports = Widget;
}(module));
