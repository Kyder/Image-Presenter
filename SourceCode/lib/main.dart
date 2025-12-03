import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';
import 'backend/config.dart';
import 'backend/media.dart' show MediaFile, MediaManager;
import 'backend/web_server.dart';

// App version - UPDATE THIS when you release new versions
const String APP_VERSION = '1.3.0';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize window manager
  await windowManager.ensureInitialized();

  // Configure window options
  WindowOptions windowOptions = const WindowOptions(
    size: Size(1920, 1080),
    center: true,
    backgroundColor: Colors.transparent,
    skipTaskbar: false,
    titleBarStyle: TitleBarStyle.hidden,
  );
  
  await windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
    await windowManager.setFullScreen(true);
  });

  // Load configuration
  await ConfigManager.load();
  print('✅ Configuration loaded');
  print('ℹ️  Image Presenter v$APP_VERSION');

  runApp(const MyApp());
}

// Global key to access the display screen state
final GlobalKey<_DisplayScreenState> displayKey = GlobalKey<_DisplayScreenState>();

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    _startWebServer();
  }

  Future<void> _startWebServer() async {
    // Start web server with callback
    final webServer = WebServer(
      onMediaUpdate: () {
        // Notify the display screen to reload media
        displayKey.currentState?._reloadMedia();
      },
    );
    
    await webServer.start(ConfigManager.current.port);
    print('✅ Web server started on port ${ConfigManager.current.port}');
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Image Presenter',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: DisplayScreen(key: displayKey),
    );
  }
}

class DisplayScreen extends StatefulWidget {
  const DisplayScreen({super.key});

  @override
  State<DisplayScreen> createState() => _DisplayScreenState();
}

class _DisplayScreenState extends State<DisplayScreen> {
  List<MediaFile> _mediaFiles = [];
  int _currentIndex = 0;
  bool _isLoading = true;
  String? _error;
  ui.Image? _currentImage;

  @override
  void initState() {
    super.initState();
    _loadData();
    _startConfigReloader();
  }

  void _startConfigReloader() {
    Future.delayed(const Duration(seconds: 2), () async {
      if (mounted) {
        await ConfigManager.load();
        setState(() {}); // Trigger rebuild with new config
        _startConfigReloader();
      }
    });
  }

  // Called by web server when media files change
  Future<void> _reloadMedia() async {
    print('🔄 Reloading media files...');
    final files = await MediaManager.getFiles();
    
    if (mounted) {
      setState(() {
        _mediaFiles = files;
        if (_mediaFiles.isEmpty) {
          _currentIndex = 0;
          _currentImage = null;
        } else if (_currentIndex >= _mediaFiles.length) {
          _currentIndex = 0;
          _loadCurrentImage();
        } else {
          _loadCurrentImage();
        }
      });
      
      // Start slideshow if it wasn't running
      if (_mediaFiles.isNotEmpty && _currentImage == null) {
        _startSlideshow();
      }
    }
  }

  Future<void> _loadData() async {
    try {
      final files = await MediaManager.getFiles();

      setState(() {
        _mediaFiles = files;
        _isLoading = false;
      });

      if (_mediaFiles.isNotEmpty) {
        await _loadCurrentImage();
        _startSlideshow();
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _loadCurrentImage() async {
    if (_mediaFiles.isEmpty) return;
    
    final currentFile = _mediaFiles[_currentIndex];
    if (currentFile.fileType != 'image') return;

    try {
      final bytes = await File(currentFile.filePath).readAsBytes();
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      
      setState(() {
        _currentImage = frame.image;
      });
    } catch (e) {
      print('Error loading image: $e');
    }
  }

  void _startSlideshow() {
    if (_mediaFiles.isEmpty) return;

    Future.delayed(
      Duration(milliseconds: ConfigManager.current.imageDuration),
      () async {
        if (mounted) {
          setState(() {
            _currentIndex = (_currentIndex + 1) % _mediaFiles.length;
          });
          await _loadCurrentImage();
          _startSlideshow();
        }
      },
    );
  }

  @override
  void dispose() {
    _currentImage?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              const Text(
                'Error Loading Application',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(color: Colors.white70, fontSize: 16),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    if (_mediaFiles.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.image_not_supported,
                size: 64, color: Colors.white54),
            const SizedBox(height: 16),
            const Text(
              'No Media Files Found',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Please add media files to the Media folder',
              style: TextStyle(color: Colors.white70, fontSize: 16),
            ),
            const SizedBox(height: 4),
            const Text(
              'Supported formats: SVG, PNG, JPG, MP4',
              style: TextStyle(color: Colors.white70, fontSize: 16),
            ),
            const SizedBox(height: 16),
            Text(
              'Web control: http://localhost:${ConfigManager.current.port}',
              style: const TextStyle(color: Colors.blue, fontSize: 16),
            ),
          ],
        ),
      );
    }

    final currentFile = _mediaFiles[_currentIndex];

    if (currentFile.fileType == 'image' && _currentImage != null) {
      return LayoutBuilder(
        builder: (context, constraints) {
          return CustomPaint(
            painter: RotatedImagePainter(
              image: _currentImage!,
              rotation: ConfigManager.current.rotation,
              scalingMode: ConfigManager.current.imageScaling,
            ),
            size: Size(constraints.maxWidth, constraints.maxHeight),
            child: Container(),
          );
        },
      );
    }

    // Video placeholder
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.video_library, size: 64, color: Colors.white54),
          const SizedBox(height: 16),
          Text(
            'Video: ${currentFile.name}',
            style: const TextStyle(color: Colors.white, fontSize: 18),
          ),
          const SizedBox(height: 8),
          const Text(
            'Video playback not yet implemented',
            style: TextStyle(color: Colors.white70, fontSize: 16),
          ),
        ],
      ),
    );
  }
}

class RotatedImagePainter extends CustomPainter {
  final ui.Image image;
  final int rotation;
  final String scalingMode;

  RotatedImagePainter({
    required this.image,
    required this.rotation,
    required this.scalingMode,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..filterQuality = FilterQuality.high;

    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);

    final radians = rotation * 3.14159 / 180;
    canvas.rotate(radians);

    final isRotated90 = rotation == 90 || rotation == -90;
    final canvasWidth = isRotated90 ? size.height : size.width;
    final canvasHeight = isRotated90 ? size.width : size.height;

    double scaleX, scaleY;
    
    switch (scalingMode) {
      case 'fill':
        scaleX = canvasWidth / image.width;
        scaleY = canvasHeight / image.height;
        break;
        
      case 'cover':
        final scale = (canvasWidth / image.width).max(canvasHeight / image.height);
        scaleX = scale;
        scaleY = scale;
        break;
        
      case 'contain':
      default:
        final scale = (canvasWidth / image.width).min(canvasHeight / image.height);
        scaleX = scale;
        scaleY = scale;
        break;
    }

    final drawWidth = image.width * scaleX;
    final drawHeight = image.height * scaleY;

    final srcRect = Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble());
    final dstRect = Rect.fromLTWH(
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );

    canvas.drawImageRect(image, srcRect, dstRect, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(RotatedImagePainter oldDelegate) {
    return oldDelegate.image != image ||
           oldDelegate.rotation != rotation ||
           oldDelegate.scalingMode != scalingMode;
  }
}

extension on double {
  double max(double other) => this > other ? this : other;
  double min(double other) => this < other ? this : other;
}