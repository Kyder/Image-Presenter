// updateapp.js
// Dedicated update handling module for digital signage application

const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class UpdateManager {
  constructor(appDir) {
    this.appDir = appDir;
  }

  async cleanupScheduledTasks() {
    if (process.platform !== 'win32') return;
    
    try {
      const taskInfoPath = path.join(this.appDir, 'cleanup-task.json');
      
      // Check if cleanup file exists
      try {
        await fs.access(taskInfoPath);
      } catch {
        return; // No cleanup needed
      }
      
      const taskInfo = JSON.parse(await fs.readFile(taskInfoPath, 'utf8'));
      const taskName = taskInfo.taskName;
      
      console.log('Cleaning up scheduled task:', taskName);
      
      // Delete the scheduled task
      const { exec } = require('child_process');
      exec(`schtasks /delete /tn "${taskName}" /f`, (error, stdout, stderr) => {
        if (error) {
          console.log('Task cleanup note:', error.message);
        } else {
          console.log('Scheduled task deleted successfully');
        }
      });
      
      // Remove the cleanup file
      await fs.unlink(taskInfoPath);
      console.log('Task cleanup completed');
      
    } catch (err) {
      console.log('Task cleanup error (non-critical):', err.message);
    }
  }

  async createWindowsUpdateScript(updatePath, restartPC) {
    const exePath = process.execPath;
    const appAsarPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar')
      : path.join(this.appDir, 'dist', 'win-unpacked', 'resources', 'app.asar');
    
    const taskName = 'ImagePresenterRestart_' + Date.now();
    
    const batchContent = `@echo off
echo Closing application...
taskkill /F /IM "${path.basename(exePath)}" >nul 2>&1
echo Waiting for process to terminate...
timeout /t 3 /nobreak > nul
echo Applying update...
if exist "${appAsarPath}" (
    copy /Y "${updatePath}" "${appAsarPath}"
    if errorlevel 1 (
        echo ERROR: Failed to update app.asar
        echo Make sure the application is fully closed
        pause
        exit /b 1
    ) else (
        echo Update applied successfully!
    )
) else (
    echo WARNING: app.asar not found at expected location
    echo Update file saved at: ${updatePath}
    echo For development mode, manually copy this file to your app location
)

${restartPC === 'true' ? `
echo.
echo Restarting computer in 5 seconds...
echo Press Ctrl+C to cancel restart
timeout /t 5
shutdown /r /t 0 /f
` : `
echo Starting application using Task Scheduler method...

REM Method 1: Try Task Scheduler (silent)
echo Creating scheduled task...
schtasks /create /tn "${taskName}" /tr "\\"${exePath}\\"" /sc once /st 00:00 /sd 01/01/2030 /f >nul 2>&1
if errorlevel 1 (
    echo Task Scheduler method failed, trying direct start...
    goto DIRECT_START
)

echo Running scheduled task...
schtasks /run /tn "${taskName}" >nul 2>&1
if errorlevel 1 (
    echo Failed to run task, cleaning up and trying direct start...
    schtasks /delete /tn "${taskName}" /f >nul 2>&1
    goto DIRECT_START
)

echo Application started successfully via Task Scheduler
timeout /t 2 /nobreak > nul
goto END

:DIRECT_START
echo Using direct start method...
start "" "${exePath}"
timeout /t 2 /nobreak > nul

:END
echo Update complete!
`}
echo This window will close in 2 seconds...
timeout /t 2 /nobreak > nul
exit`;
    
    const batchPath = path.join(this.appDir, 'apply-update.bat');
    await fs.writeFile(batchPath, batchContent);
    
    console.log('Created update script:', batchPath);
    console.log('Task name for cleanup:', taskName);
    
    // Store task name for cleanup
    const taskInfo = {
      taskName: taskName,
      created: Date.now()
    };
    await fs.writeFile(
      path.join(this.appDir, 'cleanup-task.json'), 
      JSON.stringify(taskInfo, null, 2)
    );

    return { batchPath, taskName };
  }

  async createLinuxUpdateScript(updatePath, restartPC) {
    const exePath = process.execPath;
    const appName = path.basename(exePath);
    
    // Detect app.asar path
    let appAsarPath;
    if (app.isPackaged) {
      const possiblePaths = [
        path.join(process.resourcesPath, 'app.asar'),
        path.join(path.dirname(exePath), 'resources', 'app.asar'),
        path.join(path.dirname(exePath), '..', 'Resources', 'app.asar')
      ];
      
      for (const testPath of possiblePaths) {
        try {
          await fs.access(testPath);
          appAsarPath = testPath;
          break;
        } catch {}
      }
    }
    
    if (!appAsarPath) {
      appAsarPath = path.join(this.appDir, 'app.asar');
    }
    
    const scriptContent = `#!/bin/bash
echo "Applying update..."

# Kill application
pkill -f "${exePath}" 2>/dev/null || true
pkill -f "${appName}" 2>/dev/null || true
sleep 3

# Apply update
echo "Copying update to ${appAsarPath}"
mkdir -p "$(dirname "${appAsarPath}")"
cp "${updatePath}" "${appAsarPath}" || {
    echo "ERROR: Failed to apply update"
    exit 1
}

echo "Update applied successfully!"

${restartPC === 'true' ? `
echo "Restarting computer in 5 seconds..."
sleep 5
if command -v systemctl >/dev/null 2>&1; then
    systemctl reboot
elif command -v reboot >/dev/null 2>&1; then
    reboot
else
    shutdown -r now
fi
` : `
# Start application
sleep 2
nohup "${exePath}" </dev/null >/dev/null 2>&1 &
echo "Application restarted"
`}

# Cleanup
rm -f "${updatePath}" 2>/dev/null
rm -f "$0" 2>/dev/null
exit 0`;
    
    const scriptPath = path.join(this.appDir, 'apply-update.sh');
    await fs.writeFile(scriptPath, scriptContent);
    await fs.chmod(scriptPath, '755');
    
    console.log('Created update script:', scriptPath);
    return scriptPath;
  }

  async executeWindowsUpdate(batchPath) {
    return new Promise((resolve, reject) => {
      require('child_process').exec(`start "Update" cmd /c "${batchPath}"`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async executeLinuxUpdate(scriptPath) {
    return new Promise((resolve, reject) => {
      const child = require('child_process').spawn('bash', [scriptPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      resolve();
    });
  }

  async processUpdate(updatePath, restartPC, target) {
    try {
      console.log('Processing update...');
      console.log('Update path:', updatePath);
      console.log('Restart PC:', restartPC);
      console.log('Platform:', process.platform);

      if (process.platform === 'win32') {
        const { batchPath } = await this.createWindowsUpdateScript(updatePath, restartPC);
        
        // Execute batch file and exit
        setTimeout(async () => {
          try {
            await this.executeWindowsUpdate(batchPath);
            console.log('Windows update script started');
          } catch (error) {
            console.error('Failed to execute Windows update script:', error);
          }
          // Force exit
          process.exit(0);
        }, 500);

        return {
          success: true,
          message: restartPC === 'true' 
            ? 'Update scheduled, computer will restart...' 
            : 'Update scheduled, restarting application...'
        };

      } else {
        // Linux/Mac
        const scriptPath = await this.createLinuxUpdateScript(updatePath, restartPC);
        
        // Execute script and exit
        setTimeout(async () => {
          try {
            await this.executeLinuxUpdate(scriptPath);
            console.log('Linux update script started');
          } catch (error) {
            console.error('Failed to execute Linux update script:', error);
          }
          // Force exit after delay
          setTimeout(() => {
            process.exit(0);
          }, 1000);
        }, 500);

        return {
          success: true,
          message: restartPC === 'true' 
            ? 'Update scheduled, computer will restart...' 
            : 'Update scheduled, restarting application...'
        };
      }

    } catch (error) {
      console.error('Update processing error:', error);
      throw new Error('Update failed: ' + error.message);
    }
  }

  async createReceivedUpdateScript(updatePath) {
    if (process.platform === 'win32') {
      const batchContent = `@echo off
echo Applying update...
timeout /t 2 /nobreak > nul
copy /Y "${updatePath}" "${process.resourcesPath}\\app.asar"
echo Update applied. Starting application...
start "" "${process.execPath}"
exit`;
      
      const batchPath = path.join(this.appDir, 'apply-update.bat');
      await fs.writeFile(batchPath, batchContent);
      
      // Execute batch file
      require('child_process').exec(`start "" "${batchPath}"`);
    } else {
      // Linux/Mac script
      const scriptContent = `#!/bin/bash
echo "Applying update..."
sleep 2
cp -f "${updatePath}" "${process.resourcesPath}/app.asar"
echo "Update applied. Starting application..."
"${process.execPath}" &
exit`;
      
      const scriptPath = path.join(this.appDir, 'apply-update.sh');
      await fs.writeFile(scriptPath, scriptContent);
      await fs.chmod(scriptPath, '755');
      
      require('child_process').exec(`"${scriptPath}"`);
    }
  }
}

module.exports = UpdateManager;