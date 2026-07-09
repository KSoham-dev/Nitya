# Daily Social Flow Report

This document outlines the implementation plan for the new Daily Social Flow Report, which will identify applications with "social flow" enabled and summarize their published magic media over the last 24 hours.

## Background
The goal is to create a daily report similar to the "Daily Inventory Report" but focused on social media automation (Magic Media). The report will be sent to the administrators of each application that has social flow enabled and will highlight the posts published within the last 24 hours.

## Open Questions
> [!IMPORTANT]
> Please review and confirm the following assumptions:
> 1. **"Link of social"**: Our samples of `magic_media` have `media_url` (the actual video/image generated) and `media_preview_url` (the thumbnail). Does "link of social" refer to this `media_url`, or is the actual URL of the post on Facebook/Instagram/YouTube stored somewhere else (e.g., inside `additional_metadata`)? I plan to use `media_url` as the link and `media_preview_url` as the thumbnail.
> 2. **CSV vs. HTML**: The Daily Inventory Report attaches a CSV if there are items, but you mentioned "add that post as a thumbnail". Thumbnails can't be added to a CSV effectively. I plan to include the thumbnails, Time, VIN, and Link directly inside an HTML table in the email body. Is this correct? Should I also attach a CSV without thumbnails?

## Proposed Approach

### 1. Identify Target Applications
- Query the `applications` collection for documents where `sdk_settings.autoflow_settings.enable_car_publish_autoflow` is `True`.
- This gives us the list of application IDs that are eligible for the report.

### 2. Fetch Relevant Magic Media
- For each eligible application, query the `magic_media` collection:
  - `application`: `<application_id>`
  - `publish_status`: `"published"`
  - `publish_date`: `>=` (Current time - 24 hours)
- Sort these documents by `publish_date` descending.

### 3. Retrieve VINs
- The `magic_media` documents contain a `products` array (ObjectIDs of products).
- Query the `products` collection for these ObjectIDs to fetch the `lookup_id` (VIN) for each product.

### 4. Build the Report Data
For each application, compile a list of records containing:
- **Time**: `publish_date` from `magic_media`
- **VIN**: `lookup_id` from the associated product
- **Thumbnail**: `media_preview_url` from `magic_media`
- **Social Link**: `media_url` (or specific link from `additional_metadata` based on the answer to the open question)

### 5. Email Generation & Delivery
- Create a new script `scripts/script_daily_social_flow_report.py`.
- Create a new Jinja template `templates/daily_social_flow_report.html` to display the records in an HTML table with image tags for thumbnails.
- Re-use the existing logic to find application admin emails (`fetch_admin_emails_for_application` from the inventory report).
- Re-use `EmailManager` to send the emails.

## Proposed Changes

### [New Script] `scripts/script_daily_social_flow_report.py`
#### [NEW] [script_daily_social_flow_report.py](file:///home/soham/helloramp_int/hellorampiq_backend/scripts/script_daily_social_flow_report.py)
This script will contain the logic to query the database, process the data, render the HTML template, and dispatch the emails via `EmailManager`.

### [New Template] `templates/daily_social_flow_report.html`
#### [NEW] [daily_social_flow_report.html](file:///home/soham/helloramp_int/hellorampiq_backend/templates/daily_social_flow_report.html)
An HTML/Jinja template matching the design language of the Daily Inventory Report. It will present the application name, total posts in the last 24 hours, and a grid or table of the posts containing the thumbnail, VIN, Time, and Link.

## Verification Plan
1. Run the script manually on the development environment.
2. Verify that it correctly filters applications with `enable_car_publish_autoflow == True`.
3. Verify that the correct `magic_media` items (last 24h, published) are retrieved.
4. Verify that the email is generated and sent to the correct administrators without errors.
