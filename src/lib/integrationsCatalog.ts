export interface IntegrationOption {
  id: string;
  label: string;
  app: string;
}

export const INTEGRATIONS: IntegrationOption[] = [
  // ── Gmail ──────────────────────────────────────────────────────────────────
  { id: 'gmail_list_messages', label: 'Gmail: List Messages', app: 'Gmail' },
  { id: 'gmail_send_email', label: 'Gmail: Send Email', app: 'Gmail' },
  { id: 'gmail_get_thread', label: 'Gmail: Get Thread', app: 'Gmail' },
  { id: 'gmail_create_draft', label: 'Gmail: Create Draft', app: 'Gmail' },
  { id: 'gmail_archive_message', label: 'Gmail: Archive Message', app: 'Gmail' },
  { id: 'gmail_trash_message', label: 'Gmail: Trash Message', app: 'Gmail' },
  { id: 'gmail_add_label', label: 'Gmail: Add Label', app: 'Gmail' },
  { id: 'gmail_remove_label', label: 'Gmail: Remove Label', app: 'Gmail' },
  { id: 'gmail_list_drafts', label: 'Gmail: List Drafts', app: 'Gmail' },
  { id: 'gmail_get_profile', label: 'Gmail: Get Profile Info', app: 'Gmail' },

  // ── Google Sheets ──────────────────────────────────────────────────────────
  { id: 'sheets_append_row', label: 'Sheets: Append Row', app: 'Google Sheets' },
  { id: 'sheets_get_values', label: 'Sheets: Get Values', app: 'Google Sheets' },
  { id: 'sheets_update_row', label: 'Sheets: Update Row', app: 'Google Sheets' },
  { id: 'sheets_create_spreadsheet', label: 'Sheets: Create Spreadsheet', app: 'Google Sheets' },
  { id: 'sheets_clear_values', label: 'Sheets: Clear Values', app: 'Google Sheets' },
  { id: 'sheets_list_sheets', label: 'Sheets: List Sheets in Spreadsheet', app: 'Google Sheets' },
  { id: 'sheets_get_spreadsheet_info', label: 'Sheets: Get Spreadsheet Metadata', app: 'Google Sheets' },
  { id: 'sheets_delete_row', label: 'Sheets: Delete Row', app: 'Google Sheets' },
  { id: 'sheets_copy_spreadsheet', label: 'Sheets: Copy Spreadsheet File', app: 'Google Sheets' },
  { id: 'sheets_add_sheet', label: 'Sheets: Add New Sheet (Tab)', app: 'Google Sheets' },

  // ── Google Calendar ────────────────────────────────────────────────────────
  { id: 'calendar_create_event', label: 'Calendar: Create Event', app: 'Google Calendar' },
  { id: 'calendar_list_events', label: 'Calendar: List Events', app: 'Google Calendar' },
  { id: 'calendar_delete_event', label: 'Calendar: Delete Event', app: 'Google Calendar' },
  { id: 'calendar_update_event', label: 'Calendar: Update Event', app: 'Google Calendar' },
  { id: 'calendar_get_event', label: 'Calendar: Get Event details', app: 'Google Calendar' },
  { id: 'calendar_quick_add', label: 'Calendar: Quick Add Event text', app: 'Google Calendar' },
  { id: 'calendar_list_calendars', label: 'Calendar: List Calendars', app: 'Google Calendar' },
  { id: 'calendar_clear_primary', label: 'Calendar: Clear Primary Calendar', app: 'Google Calendar' },

  // ── Google Drive ───────────────────────────────────────────────────────────
  { id: 'drive_upload_file', label: 'Drive: Upload File', app: 'Google Drive' },
  { id: 'drive_list_files', label: 'Drive: List Files & Folders', app: 'Google Drive' },
  { id: 'drive_create_folder', label: 'Drive: Create Folder', app: 'Google Drive' },
  { id: 'drive_delete_file', label: 'Drive: Delete File/Folder', app: 'Google Drive' },
  { id: 'drive_download_file', label: 'Drive: Download File content', app: 'Google Drive' },
  { id: 'drive_share_file', label: 'Drive: Share File (Permissions)', app: 'Google Drive' },
  { id: 'drive_copy_file', label: 'Drive: Copy File', app: 'Google Drive' },
  { id: 'drive_get_metadata', label: 'Drive: Get File Metadata', app: 'Google Drive' },

  // ── Slack ──────────────────────────────────────────────────────────────────
  { id: 'slack_post_message', label: 'Slack: Post Message', app: 'Slack' },
  { id: 'slack_create_channel', label: 'Slack: Create Channel', app: 'Slack' },
  { id: 'slack_invite_user', label: 'Slack: Invite User to Channel', app: 'Slack' },
  { id: 'slack_add_reaction', label: 'Slack: Add Reaction to Message', app: 'Slack' },
  { id: 'slack_list_channels', label: 'Slack: List Public Channels', app: 'Slack' },
  { id: 'slack_get_user_profile', label: 'Slack: Get User Profile', app: 'Slack' },
  { id: 'slack_update_status', label: 'Slack: Update User Status', app: 'Slack' },
  { id: 'slack_remove_reaction', label: 'Slack: Remove Message Reaction', app: 'Slack' },
  { id: 'slack_set_topic', label: 'Slack: Set Channel Topic', app: 'Slack' },

  // ── Shopify ────────────────────────────────────────────────────────────────
  { id: 'shopify_list_orders', label: 'Shopify: List Orders', app: 'Shopify' },
  { id: 'shopify_create_product', label: 'Shopify: Create Product', app: 'Shopify' },
  { id: 'shopify_get_customer', label: 'Shopify: Get Customer details', app: 'Shopify' },
  { id: 'shopify_update_inventory', label: 'Shopify: Update Inventory Level', app: 'Shopify' },
  { id: 'shopify_list_products', label: 'Shopify: List Products', app: 'Shopify' },
  { id: 'shopify_create_order', label: 'Shopify: Create Draft Order', app: 'Shopify' },
  { id: 'shopify_update_price', label: 'Shopify: Update Product Price', app: 'Shopify' },
  { id: 'shopify_delete_product', label: 'Shopify: Delete Product', app: 'Shopify' },
  { id: 'shopify_create_customer', label: 'Shopify: Create Customer Profile', app: 'Shopify' },
  { id: 'shopify_list_fulfillments', label: 'Shopify: List Fulfillment Services', app: 'Shopify' },

  // ── Notion ─────────────────────────────────────────────────────────────────
  { id: 'notion_create_page', label: 'Notion: Create Page', app: 'Notion' },
  { id: 'notion_list_databases', label: 'Notion: List Databases', app: 'Notion' },
  { id: 'notion_update_block', label: 'Notion: Update Page Block', app: 'Notion' },
  { id: 'notion_query_database', label: 'Notion: Query Database Records', app: 'Notion' },
  { id: 'notion_get_database', label: 'Notion: Get Database Schema', app: 'Notion' },
  { id: 'notion_append_block_children', label: 'Notion: Append Block Children', app: 'Notion' },
  { id: 'notion_search_pages', label: 'Notion: Search Pages and Databases', app: 'Notion' },
  { id: 'notion_delete_page', label: 'Notion: Delete (Archive) Page', app: 'Notion' },
  { id: 'notion_archive_block', label: 'Notion: Archive block ID', app: 'Notion' },

  // ── HubSpot ────────────────────────────────────────────────────────────────
  { id: 'hubspot_create_contact', label: 'HubSpot: Create Contact', app: 'HubSpot' },
  { id: 'hubspot_get_deal', label: 'HubSpot: Get Deal details', app: 'HubSpot' },
  { id: 'hubspot_update_company', label: 'HubSpot: Update Company info', app: 'HubSpot' },
  { id: 'hubspot_list_contacts', label: 'HubSpot: List Contacts', app: 'HubSpot' },
  { id: 'hubspot_list_deals', label: 'HubSpot: List Deals', app: 'HubSpot' },
  { id: 'hubspot_create_company', label: 'HubSpot: Create Company Profile', app: 'HubSpot' },
  { id: 'hubspot_get_contact', label: 'HubSpot: Get Contact details', app: 'HubSpot' },
  { id: 'hubspot_create_ticket', label: 'HubSpot: Create Support Ticket', app: 'HubSpot' },
  { id: 'hubspot_list_tickets', label: 'HubSpot: List Support Tickets', app: 'HubSpot' },
  { id: 'hubspot_update_contact_status', label: 'HubSpot: Update Contact Status', app: 'HubSpot' },

  // ── GitHub ─────────────────────────────────────────────────────────────────
  { id: 'github_create_issue', label: 'GitHub: Create Issue', app: 'GitHub' },
  { id: 'github_list_commits', label: 'GitHub: List Commits', app: 'GitHub' },
  { id: 'github_create_repo', label: 'GitHub: Create Repository', app: 'GitHub' },
  { id: 'github_create_pr', label: 'GitHub: Create Pull Request', app: 'GitHub' },
  { id: 'github_add_collaborator', label: 'GitHub: Add Collaborator', app: 'GitHub' },
  { id: 'github_list_issues', label: 'GitHub: List Issues', app: 'GitHub' },
  { id: 'github_merge_pr', label: 'GitHub: Merge Pull Request', app: 'GitHub' },
  { id: 'github_get_contents', label: 'GitHub: Get Repository File Content', app: 'GitHub' },
  { id: 'github_list_repos', label: 'GitHub: List Repositories', app: 'GitHub' },
  { id: 'github_create_branch', label: 'GitHub: Create Git Branch', app: 'GitHub' },

  // ── Twilio ─────────────────────────────────────────────────────────────────
  { id: 'twilio_send_sms', label: 'Twilio: Send SMS Message', app: 'Twilio' },
  { id: 'twilio_make_call', label: 'Twilio: Trigger Voice Call', app: 'Twilio' },
  { id: 'twilio_list_sms', label: 'Twilio: List SMS Logs', app: 'Twilio' },
  { id: 'twilio_buy_number', label: 'Twilio: Search & Buy Phone Number', app: 'Twilio' },
  { id: 'twilio_get_balance', label: 'Twilio: Check Account Balance', app: 'Twilio' },
  { id: 'twilio_redirect_call', label: 'Twilio: Redirect Active Call', app: 'Twilio' },

  // ── Stripe ─────────────────────────────────────────────────────────────────
  { id: 'stripe_list_payments', label: 'Stripe: List Payments/Charges', app: 'Stripe' },
  { id: 'stripe_create_customer', label: 'Stripe: Create Customer', app: 'Stripe' },
  { id: 'stripe_create_invoice', label: 'Stripe: Create Customer Invoice', app: 'Stripe' },
  { id: 'stripe_list_customers', label: 'Stripe: List Customers', app: 'Stripe' },
  { id: 'stripe_retrieve_charge', label: 'Stripe: Retrieve Charge details', app: 'Stripe' },
  { id: 'stripe_refund_charge', label: 'Stripe: Refund Charge', app: 'Stripe' },
  { id: 'stripe_create_product', label: 'Stripe: Create Catalog Product', app: 'Stripe' },
  { id: 'stripe_create_price', label: 'Stripe: Create Product Price', app: 'Stripe' },
  { id: 'stripe_list_invoices', label: 'Stripe: List Customer Invoices', app: 'Stripe' },

  // ── Mailchimp ──────────────────────────────────────────────────────────────
  { id: 'mailchimp_add_subscriber', label: 'Mailchimp: Add List Subscriber', app: 'Mailchimp' },
  { id: 'mailchimp_send_campaign', label: 'Mailchimp: Send Campaign Email', app: 'Mailchimp' },
  { id: 'mailchimp_remove_subscriber', label: 'Mailchimp: Unsubscribe Member', app: 'Mailchimp' },
  { id: 'mailchimp_list_members', label: 'Mailchimp: List Audience Members', app: 'Mailchimp' },
  { id: 'mailchimp_create_campaign', label: 'Mailchimp: Create Draft Campaign', app: 'Mailchimp' },
  { id: 'mailchimp_create_list', label: 'Mailchimp: Create New Audience List', app: 'Mailchimp' },

  // ── Discord ────────────────────────────────────────────────────────────────
  { id: 'discord_send_channel_message', label: 'Discord: Send Message to Channel', app: 'Discord' },
  { id: 'discord_add_role', label: 'Discord: Assign Server Role', app: 'Discord' },
  { id: 'discord_remove_role', label: 'Discord: Revoke Server Role', app: 'Discord' },
  { id: 'discord_kick_member', label: 'Discord: Kick Server Member', app: 'Discord' },
  { id: 'discord_list_members', label: 'Discord: List Server Members', app: 'Discord' },
  { id: 'discord_create_invite', label: 'Discord: Create Channel Invite link', app: 'Discord' },
  { id: 'discord_create_channel', label: 'Discord: Create Server Channel', app: 'Discord' },

  // ── Trello ─────────────────────────────────────────────────────────────────
  { id: 'trello_create_card', label: 'Trello: Create Card', app: 'Trello' },
  { id: 'trello_move_card', label: 'Trello: Move Card to List', app: 'Trello' },
  { id: 'trello_delete_card', label: 'Trello: Delete Card', app: 'Trello' },
  { id: 'trello_create_list', label: 'Trello: Create List on Board', app: 'Trello' },
  { id: 'trello_get_board_lists', label: 'Trello: Get Lists in Board', app: 'Trello' },
  { id: 'trello_add_comment', label: 'Trello: Add Comment to Card', app: 'Trello' },

  // ── Airtable ───────────────────────────────────────────────────────────────
  { id: 'airtable_create_record', label: 'Airtable: Create Record (Row)', app: 'Airtable' },
  { id: 'airtable_list_records', label: 'Airtable: List Table Records', app: 'Airtable' },
  { id: 'airtable_update_record', label: 'Airtable: Update Record Fields', app: 'Airtable' },
  { id: 'airtable_delete_record', label: 'Airtable: Delete Record', app: 'Airtable' },
  { id: 'airtable_get_record', label: 'Airtable: Get Record Details', app: 'Airtable' },

  // ── Jira ───────────────────────────────────────────────────────────────────
  { id: 'jira_create_issue', label: 'Jira: Create Ticket/Issue', app: 'Jira' },
  { id: 'jira_update_ticket', label: 'Jira: Update Ticket details', app: 'Jira' },
  { id: 'jira_add_comment', label: 'Jira: Add Comment to Issue', app: 'Jira' },
  { id: 'jira_list_projects', label: 'Jira: List Projects', app: 'Jira' },
  { id: 'jira_assign_issue', label: 'Jira: Assign Issue to User', app: 'Jira' },
  { id: 'jira_transition_issue', label: 'Jira: Transition Issue Status', app: 'Jira' },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  { id: 'openai_chat_completion', label: 'OpenAI: Chat GPT-4o Prompt', app: 'OpenAI' },
  { id: 'openai_image_generation', label: 'OpenAI: Image DALL-E Generator', app: 'OpenAI' },
  { id: 'openai_audio_transcription', label: 'OpenAI: Speech to Text (Whisper)', app: 'OpenAI' },
  { id: 'openai_embeddings', label: 'OpenAI: Generate Text Embeddings', app: 'OpenAI' },
  { id: 'openai_create_finetune', label: 'OpenAI: Create Fine-Tuning Job', app: 'OpenAI' },

  // ── Salesforce ─────────────────────────────────────────────────────────────
  { id: 'salesforce_create_lead', label: 'Salesforce: Create Lead', app: 'Salesforce' },
  { id: 'salesforce_get_account', label: 'Salesforce: Get Account Info', app: 'Salesforce' },
  { id: 'salesforce_update_contact', label: 'Salesforce: Update Contact record', app: 'Salesforce' },
  { id: 'salesforce_list_leads', label: 'Salesforce: List Leads', app: 'Salesforce' },
  { id: 'salesforce_create_opportunity', label: 'Salesforce: Create Opportunity', app: 'Salesforce' },
  { id: 'salesforce_update_task', label: 'Salesforce: Update Task status', app: 'Salesforce' },
  { id: 'salesforce_delete_record', label: 'Salesforce: Delete CRM Record', app: 'Salesforce' },

  // ── Asana ──────────────────────────────────────────────────────────────────
  { id: 'asana_create_task', label: 'Asana: Create Task', app: 'Asana' },
  { id: 'asana_list_projects', label: 'Asana: List Projects', app: 'Asana' },
  { id: 'asana_update_task_status', label: 'Asana: Update Task Status', app: 'Asana' },
  { id: 'asana_add_subtask', label: 'Asana: Add Subtask to Task', app: 'Asana' },
  { id: 'asana_create_project', label: 'Asana: Create Project', app: 'Asana' },
  { id: 'asana_assign_task', label: 'Asana: Assign Task to User', app: 'Asana' },

  // ── Linear ─────────────────────────────────────────────────────────────────
  { id: 'linear_create_issue', label: 'Linear: Create Ticket/Issue', app: 'Linear' },
  { id: 'linear_update_issue', label: 'Linear: Update Issue status', app: 'Linear' },
  { id: 'linear_list_teams', label: 'Linear: List Teams', app: 'Linear' },
  { id: 'linear_list_cycles', label: 'Linear: List Workspace Cycles', app: 'Linear' },
  { id: 'linear_assign_ticket', label: 'Linear: Assign Ticket to Member', app: 'Linear' },
  { id: 'linear_link_issue', label: 'Linear: Link Issue to external URL', app: 'Linear' },

  // ── Zoom ───────────────────────────────────────────────────────────────────
  { id: 'zoom_create_meeting', label: 'Zoom: Create Meeting', app: 'Zoom' },
  { id: 'zoom_list_meetings', label: 'Zoom: List Meetings scheduled', app: 'Zoom' },
  { id: 'zoom_delete_meeting', label: 'Zoom: Delete Meeting', app: 'Zoom' },
  { id: 'zoom_get_recording', label: 'Zoom: Get Cloud Recording link', app: 'Zoom' },
  { id: 'zoom_add_registrant', label: 'Zoom: Add Meeting Registrant', app: 'Zoom' },

  // ── Zendesk ────────────────────────────────────────────────────────────────
  { id: 'zendesk_create_ticket', label: 'Zendesk: Create Support Ticket', app: 'Zendesk' },
  { id: 'zendesk_update_ticket', label: 'Zendesk: Update Ticket comments', app: 'Zendesk' },
  { id: 'zendesk_list_users', label: 'Zendesk: List Workspace Users', app: 'Zendesk' },
  { id: 'zendesk_get_ticket_info', label: 'Zendesk: Get Ticket details', app: 'Zendesk' },
  { id: 'zendesk_assign_ticket', label: 'Zendesk: Assign Ticket to Agent', app: 'Zendesk' },

  // ── ClickUp ────────────────────────────────────────────────────────────────
  { id: 'clickup_create_task', label: 'ClickUp: Create Task', app: 'ClickUp' },
  { id: 'clickup_list_folders', label: 'ClickUp: List Folder Spaces', app: 'ClickUp' },
  { id: 'clickup_create_list', label: 'ClickUp: Create List in Folder', app: 'ClickUp' },
  { id: 'clickup_update_task_status', label: 'ClickUp: Update Task Status', app: 'ClickUp' },
  { id: 'clickup_track_time', label: 'ClickUp: Log Time on Task', app: 'ClickUp' },

  // ── Figma ──────────────────────────────────────────────────────────────────
  { id: 'figma_get_file', label: 'Figma: Get File JSON structure', app: 'Figma' },
  { id: 'figma_get_comments', label: 'Figma: Get File Comments', app: 'Figma' },
  { id: 'figma_post_comment', label: 'Figma: Post Comment to Canvas', app: 'Figma' },
  { id: 'figma_list_projects', label: 'Figma: List Team Projects', app: 'Figma' },

  // ── DocuSign ───────────────────────────────────────────────────────────────
  { id: 'docusign_send_envelope', label: 'DocuSign: Send Envelope/Agreement', app: 'DocuSign' },
  { id: 'docusign_list_envelopes', label: 'DocuSign: List Envelopes status', app: 'DocuSign' },
  { id: 'docusign_get_status', label: 'DocuSign: Get Envelope Status', app: 'DocuSign' },
  { id: 'docusign_create_template', label: 'DocuSign: Create Template Draft', app: 'DocuSign' },

  // ── Intercom ───────────────────────────────────────────────────────────────
  { id: 'intercom_create_conversation', label: 'Intercom: Open Conversation', app: 'Intercom' },
  { id: 'intercom_reply_conversation', label: 'Intercom: Reply to Customer', app: 'Intercom' },
  { id: 'intercom_list_users', label: 'Intercom: List Contact Leads', app: 'Intercom' },
  { id: 'intercom_get_user_info', label: 'Intercom: Get User Details', app: 'Intercom' },

  // ── Pipedrive ──────────────────────────────────────────────────────────────
  { id: 'pipedrive_create_deal', label: 'Pipedrive: Create Sales Deal', app: 'Pipedrive' },
  { id: 'pipedrive_update_deal', label: 'Pipedrive: Update Deal stage', app: 'Pipedrive' },
  { id: 'pipedrive_add_note', label: 'Pipedrive: Add Note to Contact', app: 'Pipedrive' },
  { id: 'pipedrive_list_activities', label: 'Pipedrive: List Schedule Activities', app: 'Pipedrive' },

  // ── Dropbox ────────────────────────────────────────────────────────────────
  { id: 'dropbox_upload_file', label: 'Dropbox: Upload File', app: 'Dropbox' },
  { id: 'dropbox_list_folder', label: 'Dropbox: List Folder contents', app: 'Dropbox' },
  { id: 'dropbox_share_folder', label: 'Dropbox: Share Folder link', app: 'Dropbox' },
  { id: 'dropbox_download_file', label: 'Dropbox: Download File contents', app: 'Dropbox' },

  // ── Box ────────────────────────────────────────────────────────────────────
  { id: 'box_upload_file', label: 'Box: Upload File', app: 'Box' },
  { id: 'box_list_folder', label: 'Box: List Folder items', app: 'Box' },
  { id: 'box_get_file_link', label: 'Box: Create Shared File Link', app: 'Box' },
  { id: 'box_delete_item', label: 'Box: Delete File or Folder', app: 'Box' },

  // ── QuickBooks ─────────────────────────────────────────────────────────────
  { id: 'quickbooks_create_customer', label: 'QuickBooks: Create Customer profile', app: 'QuickBooks' },
  { id: 'quickbooks_create_invoice', label: 'QuickBooks: Create Sales Invoice', app: 'QuickBooks' },
  { id: 'quickbooks_get_payment', label: 'QuickBooks: Get Customer Payment info', app: 'QuickBooks' },
  { id: 'quickbooks_list_vendor_bills', label: 'QuickBooks: List Vendor Bills', app: 'QuickBooks' },

  // ── Xero ───────────────────────────────────────────────────────────────────
  { id: 'xero_create_invoice', label: 'Xero: Create Accounts Invoice', app: 'Xero' },
  { id: 'xero_list_bank_accounts', label: 'Xero: List Bank Accounts', app: 'Xero' },
  { id: 'xero_create_contact', label: 'Xero: Create Contact profile', app: 'Xero' },
  { id: 'xero_get_categories', label: 'Xero: Get Tracking Categories', app: 'Xero' },

  // ── Mailgun ────────────────────────────────────────────────────────────────
  { id: 'mailgun_send_email', label: 'Mailgun: Send Transactional Email', app: 'Mailgun' },
  { id: 'mailgun_list_logs', label: 'Mailgun: List Domain logs', app: 'Mailgun' },
  { id: 'mailgun_validate_email', label: 'Mailgun: Verify Email address API', app: 'Mailgun' },

  // ── SendGrid ───────────────────────────────────────────────────────────────
  { id: 'sendgrid_send_mail', label: 'SendGrid: Send Transactional Email', app: 'SendGrid' },
  { id: 'sendgrid_list_bounces', label: 'SendGrid: Retrieve Bounce logs', app: 'SendGrid' },
  { id: 'sendgrid_add_contact', label: 'SendGrid: Add Contact to Audience List', app: 'SendGrid' },

  // ── ActiveCampaign ─────────────────────────────────────────────────────────
  { id: 'activecampaign_create_contact', label: 'ActiveCampaign: Create Contact profile', app: 'ActiveCampaign' },
  { id: 'activecampaign_add_to_list', label: 'ActiveCampaign: Add Contact to List', app: 'ActiveCampaign' },
  { id: 'activecampaign_trigger_automation', label: 'ActiveCampaign: Trigger Contact Automation', app: 'ActiveCampaign' },

  // ── Twitter/X ──────────────────────────────────────────────────────────────
  { id: 'twitter_post_tweet', label: 'Twitter: Post Tweet Message', app: 'Twitter/X' },
  { id: 'twitter_delete_tweet', label: 'Twitter: Delete Tweet ID', app: 'Twitter/X' },
  { id: 'twitter_get_tweets', label: 'Twitter: Get User Timeline Tweets', app: 'Twitter/X' },

  // ── Facebook Graph ─────────────────────────────────────────────────────────
  { id: 'facebook_post_page_feed', label: 'Facebook: Post Page Feed update', app: 'Facebook Graph' },
  { id: 'facebook_upload_photo', label: 'Facebook: Upload Photo to Page album', app: 'Facebook Graph' },
  { id: 'facebook_get_insights', label: 'Facebook: Get Page Analytics Insights', app: 'Facebook Graph' },

  // ── Pinterest ──────────────────────────────────────────────────────────────
  { id: 'pinterest_create_pin', label: 'Pinterest: Create Pin', app: 'Pinterest' },
  { id: 'pinterest_get_boards', label: 'Pinterest: Get User Boards', app: 'Pinterest' },
  { id: 'pinterest_delete_pin', label: 'Pinterest: Delete Pin', app: 'Pinterest' },

  // ── Freshworks ─────────────────────────────────────────────────────────────
  { id: 'freshworks_create_ticket', label: 'Freshworks: Create Support Ticket', app: 'Freshworks' },
  { id: 'freshworks_get_customer_info', label: 'Freshworks: Get Contact Details', app: 'Freshworks' },
  { id: 'freshworks_list_agents', label: 'Freshworks: List Helpdesk Agents', app: 'Freshworks' },

  // ── Basecamp ───────────────────────────────────────────────────────────────
  { id: 'basecamp_create_todo', label: 'Basecamp: Create Todo Item', app: 'Basecamp' },
  { id: 'basecamp_list_todo_lists', label: 'Basecamp: List Todo Groups', app: 'Basecamp' },
  { id: 'basecamp_post_message', label: 'Basecamp: Post Message Board item', app: 'Basecamp' },

  // ── Microsoft Teams ────────────────────────────────────────────────────────
  { id: 'teams_post_channel_message', label: 'Teams: Post Channel Message', app: 'Microsoft Teams' },
  { id: 'teams_create_chat', label: 'Teams: Create Direct Chat thread', app: 'Microsoft Teams' },
  { id: 'teams_list_channels', label: 'Teams: List Group Channels', app: 'Microsoft Teams' }
];

export function getIntegrationLabel(id: string): string {
  const integration = INTEGRATIONS.find(item => item.id === id);
  return integration ? integration.label : id;
}

export function getIntegrationsByApp(): Record<string, IntegrationOption[]> {
  const grouped: Record<string, IntegrationOption[]> = {};
  INTEGRATIONS.forEach(item => {
    if (!grouped[item.app]) {
      grouped[item.app] = [];
    }
    grouped[item.app].push(item);
  });
  return grouped;
}

export function getPromptIntegrationList(): string {
  return INTEGRATIONS.map(item => `"${item.id}" (${item.label})`).join(', ');
}
