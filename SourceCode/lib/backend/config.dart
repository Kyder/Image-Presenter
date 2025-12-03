import 'dart:io';
import 'dart:convert';
import 'package:path/path.dart' as path;

class Config {
  String displayName;
  int imageDuration; // milliseconds
  String videoPosition; // 'after' or 'between'
  String imageScaling; // 'contain', 'fill', 'cover'
  int rotation; // 0, 90, -90, 180
  String password;
  String staticIp;
  bool localhostOnly;
  int port;
  int wsPort;
  int discoveryPort;
  Map<String, Map<String, dynamic>> addons;

  Config({
    required this.displayName,
    this.imageDuration = 5000,
    this.videoPosition = 'after',
    this.imageScaling = 'contain',
    this.rotation = 0,
    this.password = '',
    this.staticIp = '',
    this.localhostOnly = false,
    this.port = 3006,
    this.wsPort = 3001,
    this.discoveryPort = 3002,
    Map<String, Map<String, dynamic>>? addons,
  }) : addons = addons ?? {};

  factory Config.fromJson(Map<String, dynamic> json) {
    return Config(
      displayName: json['displayName'] ?? _getHostname(),
      imageDuration: json['imageDuration'] ?? 5000,
      videoPosition: json['videoPosition'] ?? 'after',
      imageScaling: json['imageScaling'] ?? 'contain',
      rotation: json['rotation'] ?? 0,
      password: json['password'] ?? '',
      staticIp: json['staticIp'] ?? '',
      localhostOnly: json['localhostOnly'] ?? false,
      port: json['port'] ?? 3006,
      wsPort: json['wsPort'] ?? 3001,
      discoveryPort: json['discoveryPort'] ?? 3002,
      addons: (json['addons'] as Map<String, dynamic>?)?.map(
            (key, value) => MapEntry(key, Map<String, dynamic>.from(value)),
          ) ??
          {},
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'displayName': displayName,
      'imageDuration': imageDuration,
      'videoPosition': videoPosition,
      'imageScaling': imageScaling,
      'rotation': rotation,
      'password': password,
      'staticIp': staticIp,
      'localhostOnly': localhostOnly,
      'port': port,
      'wsPort': wsPort,
      'discoveryPort': discoveryPort,
      'addons': addons,
    };
  }

  static String _getHostname() {
    try {
      return Platform.localHostname;
    } catch (e) {
      return 'Digital Signage';
    }
  }
}

class ConfigManager {
  static Config? _instance;
  static String? _configPath;

  static String getAppDir() {
    if (Platform.isWindows) {
      // In development: use current directory
      // In production: use executable directory
      final exePath = Platform.resolvedExecutable;
      return path.dirname(exePath);
    } else {
      return Directory.current.path;
    }
  }

  static String getConfigPath() {
    _configPath ??= path.join(getAppDir(), 'config.json');
    return _configPath!;
  }

  static Future<Config> load() async {
    if (_instance != null) return _instance!;

    final configFile = File(getConfigPath());

    if (!await configFile.exists()) {
      print('Config file not found, creating default...');
      _instance = Config(displayName: Config._getHostname());
      await save(_instance!);
      return _instance!;
    }

    try {
      final contents = await configFile.readAsString();
      final json = jsonDecode(contents) as Map<String, dynamic>;
      _instance = Config.fromJson(json);
      print('✅ Config loaded from ${getConfigPath()}');
      return _instance!;
    } catch (e) {
      print('❌ Error loading config: $e');
      _instance = Config(displayName: Config._getHostname());
      return _instance!;
    }
  }

  static Future<void> save(Config config) async {
    _instance = config;
    final configFile = File(getConfigPath());

    try {
      final json = jsonEncode(config.toJson());
      await configFile.writeAsString(json);
      print('✅ Config saved to ${getConfigPath()}');
    } catch (e) {
      print('❌ Error saving config: $e');
      rethrow;
    }
  }

  static Config get current {
    if (_instance == null) {
      throw StateError('Config not loaded. Call ConfigManager.load() first.');
    }
    return _instance!;
  }

  static Future<void> update(Config config) async {
    await save(config);
  }
}