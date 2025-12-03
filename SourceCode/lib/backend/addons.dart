import 'dart:io';
import 'dart:convert';
import 'package:path/path.dart' as path;
import 'config.dart';

class AddonInfo {
  final String name;
  final String version;
  final String? author;
  final String? description;
  final String? category;

  AddonInfo({
    required this.name,
    required this.version,
    this.author,
    this.description,
    this.category,
  });

  factory AddonInfo.fromJson(Map<String, dynamic> json) {
    return AddonInfo(
      name: json['name'] ?? 'Unknown',
      version: json['version'] ?? '1.0.0',
      author: json['author'],
      description: json['description'],
      category: json['category'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'version': version,
      if (author != null) 'author': author,
      if (description != null) 'description': description,
      if (category != null) 'category': category,
    };
  }
}

class AddonSetting {
  final String id;
  final String name;
  final String type;
  final dynamic defaultValue;
  final String? description;
  final String? placeholder;
  final int? min;
  final int? max;
  final String? unit;
  final List<dynamic>? options;

  AddonSetting({
    required this.id,
    required this.name,
    required this.type,
    required this.defaultValue,
    this.description,
    this.placeholder,
    this.min,
    this.max,
    this.unit,
    this.options,
  });

  factory AddonSetting.fromJson(Map<String, dynamic> json) {
    return AddonSetting(
      id: json['id'],
      name: json['name'],
      type: json['type'],
      defaultValue: json['default'],
      description: json['description'],
      placeholder: json['placeholder'],
      min: json['min'],
      max: json['max'],
      unit: json['unit'],
      options: json['options'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'type': type,
      'default': defaultValue,
      if (description != null) 'description': description,
      if (placeholder != null) 'placeholder': placeholder,
      if (min != null) 'min': min,
      if (max != null) 'max': max,
      if (unit != null) 'unit': unit,
      if (options != null) 'options': options,
    };
  }
}

class Addon {
  final String id;
  final AddonInfo info;
  final List<AddonSetting> settings;
  final bool hasFrontend;
  final bool hasBackend;
  bool enabled;
  Map<String, dynamic> config;

  Addon({
    required this.id,
    required this.info,
    required this.settings,
    this.hasFrontend = false,
    this.hasBackend = false,
    this.enabled = false,
    Map<String, dynamic>? config,
  }) : config = config ?? {};

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'info': info.toJson(),
      'settings': settings.map((s) => s.toJson()).toList(),
      'enabled': enabled,
      'config': config,
      'hasFrontend': hasFrontend,
      'hasBackend': hasBackend,
    };
  }
}

class AddonManager {
  static String getAddonsDir() {
    return path.join(ConfigManager.getAppDir(), 'Addons');
  }

  static Future<void> ensureAddonsDir() async {
    final addonsDir = Directory(getAddonsDir());
    if (!await addonsDir.exists()) {
      await addonsDir.create(recursive: true);
      print('✅ Created Addons directory: ${getAddonsDir()}');
    }
  }

  static Future<Map<String, dynamic>> getAddons() async {
    await ensureAddonsDir();

    final addonsDir = Directory(getAddonsDir());
    final addons = <String, dynamic>{};

    await for (final entity in addonsDir.list()) {
      if (entity is Directory) {
        final addonId = path.basename(entity.path);
        final manifestFile = File(path.join(entity.path, 'addon.json'));

        if (await manifestFile.exists()) {
          try {
            final manifestContent = await manifestFile.readAsString();
            final manifest = jsonDecode(manifestContent) as Map<String, dynamic>;

            final info = AddonInfo.fromJson(manifest['info'] ?? {});
            final settings = (manifest['settings'] as List?)
                    ?.map((s) => AddonSetting.fromJson(s))
                    .toList() ??
                [];

            // Check for frontend.js
            final hasFrontend = await File(path.join(entity.path, 'frontend.js')).exists();

            // Check for backend.js
            final hasBackend = await File(path.join(entity.path, 'backend.js')).exists();

            final addon = Addon(
              id: addonId,
              info: info,
              settings: settings,
              hasFrontend: hasFrontend,
              hasBackend: hasBackend,
            );

            // Load saved config
            final config = ConfigManager.current;
            final savedConfig = config.addons[addonId];
            if (savedConfig != null) {
              addon.enabled = savedConfig['enabled'] ?? false;
              addon.config = Map<String, dynamic>.from(savedConfig);
            } else {
              // Use defaults
              for (final setting in settings) {
                addon.config[setting.id] = setting.defaultValue;
              }
            }

            addons[addonId] = addon.toJson();
          } catch (e) {
            print('❌ Error loading addon $addonId: $e');
          }
        }
      }
    }

    print('🔌 Loaded ${addons.length} addons');
    return addons;
  }

  static Future<String> getFrontendScript(String addonId) async {
    final scriptPath = path.join(getAddonsDir(), addonId, 'frontend.js');
    final scriptFile = File(scriptPath);

    if (!await scriptFile.exists()) {
      throw Exception('Frontend script not found for addon: $addonId');
    }

    return await scriptFile.readAsString();
  }

  static Future<void> updateConfig(String addonId, Map<String, dynamic> newConfig) async {
    final config = ConfigManager.current;

    // Remove password field if present
    newConfig.remove('password');

    config.addons[addonId] = newConfig;
    await ConfigManager.save(config);

    print('✅ Updated config for addon: $addonId');
  }

  static Future<void> reload() async {
    // Just a placeholder - addons will be reloaded on next getAddons() call
    print('🔄 Reloading addons...');
  }
}