# deploy.ps1
Write-Host "🚀 Starting deploy..." -ForegroundColor Cyan

# 1. Сборка проекта
Write-Host "`n[1/3] Building project..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completed" -ForegroundColor Green

# 2. Копирование файлов в docs
Write-Host "`n[2/3] Copying files to docs folder..." -ForegroundColor Cyan

if (Test-Path "docs/assets") { Remove-Item -Recurse -Force docs/assets }
if (Test-Path "docs/index.html") { Remove-Item -Force docs/index.html }
if (Test-Path "docs/audio") { Remove-Item -Recurse -Force docs/audio }

if (Test-Path "dist/assets") { Copy-Item -Recurse -Force dist/assets docs/ }
if (Test-Path "dist/index.html") { Copy-Item -Force dist/index.html docs/ }
if (Test-Path "dist/audio") { Copy-Item -Recurse -Force dist/audio docs/ }

Write-Host "✅ Files copied" -ForegroundColor Green

# 3. Git commit (только docs/, не dist/)
Write-Host "`n[3/3] Committing changes..." -ForegroundColor Cyan
git add docs/
git --% commit -m "Deploy: auto-update" --allow-empty

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ No changes to commit" -ForegroundColor Yellow
}

# Pull и Push
git pull origin main
git push origin main

Write-Host "`n" + "="*50 -ForegroundColor Cyan
Write-Host "🎉 Deploy completed successfully!" -ForegroundColor Green
Write-Host "🌐 Open: https://kodan76-creator.github.io/runy-dic/" -ForegroundColor Cyan
Write-Host "="*50 -ForegroundColor Cyan