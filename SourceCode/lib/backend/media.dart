import 'dart:io';
import 'package:path/path.dart' as path;
import 'config.dart' show ConfigManager;

class MediaFile {
  final String name;
  final String filePath;
  final String fileType; // 'image' or 'video'
  final int size;
  final DateTime modified;

  MediaFile({
    required this.name,
    required this.filePath,
    required this.fileType,
    required this.size,
    required this.modified,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'path': filePath,
      'type': fileType,
      'size': size,
      'modified': modified.toIso8601String(),
    };
  }
}

class MediaManager {
  static String getAppDir() {
    if (Platform.isWindows) {
      final exePath = Platform.resolvedExecutable;
      return path.dirname(exePath);
    } else {
      return Directory.current.path;
    }
  }

  static String getMediaDir() {
    return path.join(getAppDir(), 'Media');
  }

  static Future<void> ensureMediaDir() async {
    final mediaDir = Directory(getMediaDir());
    if (!await mediaDir.exists()) {
      await mediaDir.create(recursive: true);
      print('✅ Created Media directory: ${getMediaDir()}');
    }
  }

  static Future<List<MediaFile>> getFiles() async {
    await ensureMediaDir();

    final mediaDir = Directory(getMediaDir());
    final files = <MediaFile>[];

    await for (final entity in mediaDir.list()) {
      if (entity is File) {
        final ext = path.extension(entity.path).toLowerCase();
        String? fileType;

        if (['.svg', '.png', '.jpg', '.jpeg'].contains(ext)) {
          fileType = 'image';
        } else if (ext == '.mp4') {
          fileType = 'video';
        }

        if (fileType != null) {
          final stat = await entity.stat();
          files.add(MediaFile(
            name: path.basename(entity.path),
            filePath: entity.path,
            fileType: fileType,
            size: stat.size,
            modified: stat.modified,
          ));
        }
      }
    }

    // Sort by name
    files.sort((a, b) => a.name.compareTo(b.name));

    print('📁 Found ${files.length} media files');
    return files;
  }

  static Future<void> saveFile(String filename, List<int> bytes) async {
    await ensureMediaDir();

    final filePath = path.join(getMediaDir(), filename);
    final file = File(filePath);

    await file.writeAsBytes(bytes);
    print('✅ Saved media file: $filename (${bytes.length} bytes)');
  }

  static Future<void> deleteFile(String filename) async {
    final filePath = path.join(getMediaDir(), filename);
    final file = File(filePath);

    if (!await file.exists()) {
      throw Exception('File not found: $filename');
    }

    // Security check: ensure file is in Media directory
    final canonicalPath = file.absolute.path;
    final canonicalMediaDir = Directory(getMediaDir()).absolute.path;

    if (!canonicalPath.startsWith(canonicalMediaDir)) {
      throw Exception('Invalid file path: $filename');
    }

    await file.delete();
    print('🗑️  Deleted media file: $filename');
  }

  static String getFilePath(String filename) {
    return path.join(getMediaDir(), filename);
  }
}