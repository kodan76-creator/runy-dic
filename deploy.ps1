# deploy.ps1
# Сохраните в кодировке UTF-8 with BOM

Write-Host "🚀 Starting deploy..." -ForegroundColor Cyan

# 1. Сборка проекта
Write-Host "`n[1/5] Building project..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completed" -ForegroundColor Green

# 2. Копирование файлов в docs
Write-Host "`n[2/5] Copying files to docs folder..." -ForegroundColor Cyan

# Очищаем старую папку docs (кроме .git)
if (Test-Path "docs/assets") { Remove-Item -Recurse -Force docs/assets }
if (Test-Path "docs/index.html") { Remove-Item -Force docs/index.html }
if (Test-Path "docs/audio") { Remove-Item -Recurse -Force docs/audio }

# Копируем новые файлы
if (Test-Path "dist/assets") { Copy-Item -Recurse -Force dist/assets docs/ }
if (Test-Path "dist/index.html") { Copy-Item -Force dist/index.html docs/ }
if (Test-Path "dist/audio") { Copy-Item -Recurse -Force dist/audio docs/ }

Write-Host "✅ Files copied" -ForegroundColor Green

# 3. Git commit
Write-Host "`n[3/5] Committing changes..." -ForegroundColor Cyan
git add docs/
git --% commit -m "Deploy: auto-update" --allow-empty
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ No changes to commit" -ForegroundColor Yellow
}

# 4. Синхронизация с удалённым репозиторием
Write-Host "`n[4/5] Syncing with remote..." -ForegroundColor Cyan
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Pull failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Synced with remote" -ForegroundColor Green

# 5. Push
Write-Host "`n[5/5] Pushing to GitHub..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Pushed successfully" -ForegroundColor Green

# Готово
Write-Host "`n" + "="*50 -ForegroundColor Cyan
Write-Host "🎉 Deploy completed successfully!" -ForegroundColor Green
Write-Host "🌐 Open: https://kodan76-creator.github.io/runy-dic/" -ForegroundColor Cyan
Write-Host "="*50 -ForegroundColor Cyan