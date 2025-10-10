# Feature Document: Image Optimization for HTML Export

## Overview
Enhance the HTML export functionality by adding automatic image optimization using browser-native APIs, converting images to WebP format and compressing them to significantly reduce file sizes.

## Motivation
Images are a major contributor to export file bloat; optimizing them allows for smaller, more portable HTML files suitable for email attachments and quick sharing.

## Scope (MVP)
- Automatic WebP conversion
- Configurable compression quality
- Lazy loading for images
- Exclusion of unused images based on graph analysis

## Out of Scope (Future)
- Manual image editing
- Support for formats other than WebP
- Advanced compression algorithms beyond Canvas API

## Technical Implementation

### Image Processing Pipeline
1. Identify images in vault using Obsidian's metadata cache
2. Check WebP support using Canvas API toDataURL()
3. Convert to WebP using Canvas API and toBlob() if supported
4. Apply compression based on quality settings
5. Embed as base64 or lazy-load for large files
6. Exclude unused images via graph analysis

### Key Components
- **Canvas API Integration**: Browser-native image processing using Canvas and toBlob()
- **WebP Support Detection**: Checks if WebP format is supported; falls back to original format if not
- **Quality Settings**: Configurable compression levels (e.g., 80% quality)
- **Lazy Loading**: Defer loading of below-fold images
- **Graph Analysis**: Remove unreferenced images to reduce size

### File Structure
```
src/
  utils/
    imageOptimizer.ts    # New image processing utility
    htmlRenderer.ts      # Updated to use optimized images
```

## User Experience
1. Export process automatically optimizes images
2. Settings panel allows quality adjustment (high/medium/low)
3. Progress bar shows optimization status for large vaults
4. Exported HTML loads faster with smaller file sizes

## Success Criteria
- ✅ WebP conversion reduces image sizes by 30-60%
- ✅ Overall export file size <5MB for typical vaults
- ✅ No visible quality loss at default settings
- ✅ Lazy loading improves initial load times
- ✅ Works with existing image formats (PNG, JPG, etc.)

## Dependencies
- Browser Canvas API and toBlob() for image processing
- Existing Obsidian APIs for file access
- Follows existing code patterns from htmlRenderer.ts

## Testing
- Unit tests for image conversion functions
- Integration tests with sample images
- Performance benchmarks for file size reduction
- Compatibility tests across image formats

## Future Extensions
- Advanced compression options (lossless/lossy)
- Custom quality presets
- Image resizing for different screen sizes
- Batch optimization for multiple exports

This feature provides immediate value by reducing export file sizes, making HTML exports more practical for sharing and archiving.