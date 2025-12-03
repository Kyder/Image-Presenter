import 'dart:io';
import 'dart:convert';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_router/shelf_router.dart';
import 'package:shelf_static/shelf_static.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as path;
import 'config.dart';
import 'media.dart' show MediaManager;
import 'addons.dart' show AddonManager;

// App version - UPDATE THIS when you release new versions
const String APP_VERSION = '3.0.0';

class WebServer {
  HttpServer? _server;
  
  // Callbacks for notifying Flutter when data changes
  final void Function()? onMediaUpdate;
  
  WebServer({this.onMediaUpdate});

  Future<void> start(int port) async {
    final router = Router();

    // API Routes
    router.get('/api/config', _handleGetConfig);
    router.post('/api/config', _handlePostConfig);
    router.post('/api/password', _handleChangePassword);

    router.get('/api/media', _handleGetMedia);
    router.post('/api/media/upload', _handleUploadMedia);
    router.delete('/api/media/<filename>', _handleDeleteMedia);

    router.get('/api/addons', _handleGetAddons);
    router.post('/api/addons/reload', _handleReloadAddons);
    router.post('/api/addons/<id>/config', _handleUpdateAddonConfig);

    router.get('/api/peers', _handleGetPeers);
    router.post('/api/peers/add', _handleAddPeer);
    router.delete('/api/peers/<id>', _handleRemovePeer);

    // Serve static files from web directory
    final webDir = path.join(ConfigManager.getAppDir(), 'web');
    final staticHandler = createStaticHandler(
      webDir,
      defaultDocument: 'index.html',
    );

    final handler = Cascade()
        .add(router.call)
        .add(staticHandler)
        .handler;

    final pipeline = Pipeline()
        .addMiddleware(logRequests())
        .addMiddleware(_corsHeaders())
        .addHandler(handler);

    _server = await shelf_io.serve(pipeline, InternetAddress.anyIPv4, port);
  }

  Future<void> stop() async {
    await _server?.close(force: true);
  }

  // CORS middleware
  Middleware _corsHeaders() {
    return (Handler handler) {
      return (Request request) async {
        if (request.method == 'OPTIONS') {
          return Response.ok('', headers: _getCorsHeaders());
        }

        final response = await handler(request);
        return response.change(headers: _getCorsHeaders());
      };
    };
  }

  Map<String, String> _getCorsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept',
    };
  }

  // Config handlers
  Future<Response> _handleGetConfig(Request request) async {
    final config = ConfigManager.current;
    return Response.ok(
      jsonEncode({
        'displayName': config.displayName,
        'imageDuration': config.imageDuration,
        'videoPosition': config.videoPosition,
        'imageScaling': config.imageScaling,
        'rotation': config.rotation,
        'hasPassword': config.password.isNotEmpty,
        'staticIp': config.staticIp,
        'localhostOnly': config.localhostOnly,
        'port': config.port,
        'wsPort': config.wsPort,
        'discoveryPort': config.discoveryPort,
        'version': APP_VERSION,
        'peers': [],
      }),
      headers: {'Content-Type': 'application/json'},
    );
  }

  Future<Response> _handlePostConfig(Request request) async {
    try {
      final body = await request.readAsString();
      final json = jsonDecode(body) as Map<String, dynamic>;

      final config = ConfigManager.current;

      if (json['displayName'] != null) {
        config.displayName = json['displayName'];
      }
      if (json['imageDuration'] != null) {
        config.imageDuration = json['imageDuration'];
      }
      if (json['videoPosition'] != null) {
        config.videoPosition = json['videoPosition'];
      }
      if (json['imageScaling'] != null) {
        config.imageScaling = json['imageScaling'];
      }
      if (json['rotation'] != null) {
        config.rotation = json['rotation'];
      }
      if (json['staticIp'] != null) {
        config.staticIp = json['staticIp'];
      }
      if (json['localhostOnly'] != null) {
        config.localhostOnly = json['localhostOnly'];
      }

      await ConfigManager.save(config);

      return Response.ok(
        jsonEncode({'success': true}),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  Future<Response> _handleChangePassword(Request request) async {
    try {
      final body = await request.readAsString();
      final json = jsonDecode(body) as Map<String, dynamic>;

      final config = ConfigManager.current;
      config.password = json['newPassword'] ?? '';
      await ConfigManager.save(config);

      return Response.ok(
        jsonEncode({'success': true}),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  // Media handlers
  Future<Response> _handleGetMedia(Request request) async {
    try {
      final files = await MediaManager.getFiles();
      final json = files.map((f) => f.toJson()).toList();
      return Response.ok(
        jsonEncode(json),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  Future<Response> _handleUploadMedia(Request request) async {
    try {
      final contentType = request.headers['content-type'];
      if (contentType == null || !contentType.startsWith('multipart/form-data')) {
        return Response.badRequest(
          body: jsonEncode({'error': 'Invalid content type'}),
          headers: {'Content-Type': 'application/json'},
        );
      }

      final boundary = contentType.split('boundary=').last;
      final transformer = MimeMultipartTransformer(boundary);
      final bodyStream = Stream.fromIterable([await request.read().toList()].expand((x) => x));
      final parts = await transformer.bind(bodyStream).toList();

      int uploadedCount = 0;

      for (final part in parts) {
        final contentDisposition = part.headers['content-disposition'];
        if (contentDisposition != null) {
          final filenameMatch = RegExp(r'filename="([^"]+)"').firstMatch(contentDisposition);
          if (filenameMatch != null) {
            final filename = filenameMatch.group(1)!;
            final bytes = await part.toList();
            final allBytes = bytes.expand((x) => x).toList();

            await MediaManager.saveFile(filename, allBytes);
            uploadedCount++;
          }
        }
      }

      // Notify Flutter app that media changed
      print('📁 Uploaded $uploadedCount file(s)');
      onMediaUpdate?.call();

      return Response.ok(
        jsonEncode({'success': true, 'files': uploadedCount}),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      print('Upload error: $e');
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  Future<Response> _handleDeleteMedia(Request request, String filename) async {
    try {
      await MediaManager.deleteFile(filename);

      // Notify Flutter app that media changed
      print('🗑️  Deleted: $filename');
      onMediaUpdate?.call();

      return Response.ok(
        jsonEncode({'success': true}),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  // Addon handlers
  Future<Response> _handleGetAddons(Request request) async {
    try {
      final addons = await AddonManager.getAddons();
      return Response.ok(
        jsonEncode(addons),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  Future<Response> _handleReloadAddons(Request request) async {
    try {
      await AddonManager.reload();

      return Response.ok(
        jsonEncode({'success': true}),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  Future<Response> _handleUpdateAddonConfig(Request request, String addonId) async {
    try {
      final body = await request.readAsString();
      final json = jsonDecode(body) as Map<String, dynamic>;

      await AddonManager.updateConfig(addonId, json);

      return Response.ok(
        jsonEncode({'success': true}),
        headers: {'Content-Type': 'application/json'},
      );
    } catch (e) {
      return Response.internalServerError(
        body: jsonEncode({'error': e.toString()}),
        headers: {'Content-Type': 'application/json'},
      );
    }
  }

  // Peer handlers (placeholder for network discovery)
  Future<Response> _handleGetPeers(Request request) async {
    return Response.ok(
      jsonEncode([]),
      headers: {'Content-Type': 'application/json'},
    );
  }

  Future<Response> _handleAddPeer(Request request) async {
    return Response.ok(
      jsonEncode({'success': true}),
      headers: {'Content-Type': 'application/json'},
    );
  }

  Future<Response> _handleRemovePeer(Request request, String id) async {
    return Response.ok(
      jsonEncode({'success': true}),
      headers: {'Content-Type': 'application/json'},
    );
  }
}