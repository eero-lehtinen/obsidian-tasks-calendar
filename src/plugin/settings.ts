import { type App, PluginSettingTab, Setting } from "obsidian";
import type TasksCalendarPlugin from "../main";
import type { DateField, TasksCalendarSettings } from "../types";

export const DEFAULT_SETTINGS: TasksCalendarSettings = {
  defaultView: "month",
  weekStartsOn: 1,
  showCompleted: true,
  showTaskSource: true,
  completedOpacity: 0.42,
  forceAnimations: false,
  defaultQuery: "",
  datePreference: ["scheduled", "due", "start"],
  undatedTasks: "hide",
  newTaskFile: "Tasks.md",
  taskOrder: {},
  lastViewState: null,
  embeddedViewStates: {},
};

export class TasksCalendarSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TasksCalendarPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default calendar view")
      .setDesc("The view used when a new Tasks Calendar is opened.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("month", "Month")
          .addOption("week", "Week")
          .addOption("day", "Day")
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value) => {
            this.plugin.settings.defaultView = value as TasksCalendarSettings["defaultView"];
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("First day of week").addDropdown((dropdown) =>
      dropdown
        .addOption("1", "Monday")
        .addOption("0", "Sunday")
        .setValue(String(this.plugin.settings.weekStartsOn))
        .onChange(async (value) => {
          this.plugin.settings.weekStartsOn = Number(value) as 0 | 1;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendars();
        }),
    );

    new Setting(containerEl)
      .setName("Show completed tasks")
      .setDesc("Completed tasks remain visible but are muted. The calendar toolbar can override this.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showCompleted).onChange(async (value) => {
          this.plugin.settings.showCompleted = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendars();
        }),
      );

    new Setting(containerEl)
      .setName("Show task source file")
      .setDesc("Display the source file beneath tasks in week and day views.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showTaskSource).onChange(async (value) => {
          this.plugin.settings.showTaskSource = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendars();
        }),
      );

    new Setting(containerEl).setName("Completed task opacity").addSlider((slider) =>
      slider
        .setLimits(0.15, 0.8, 0.05)
        .setValue(this.plugin.settings.completedOpacity)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.completedOpacity = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendars();
        }),
    );

    new Setting(containerEl)
      .setName("Always animate")
      .setDesc("Play checkbox and task animations even when your system requests reduced motion.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.forceAnimations).onChange(async (value) => {
          this.plugin.settings.forceAnimations = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendars();
        }),
      );

    new Setting(containerEl)
      .setName("Date priority")
      .setDesc("First available field determines where a task appears. Use scheduled, due, and start once each.")
      .addText((text) =>
        text
          .setPlaceholder("scheduled, due, start")
          .setValue(this.plugin.settings.datePreference.join(", "))
          .onChange(async (value) => {
            const fields = value.split(",").map((item) => item.trim().toLowerCase());
            if (isDatePreference(fields)) {
              this.plugin.settings.datePreference = fields;
              await this.plugin.saveSettings();
              this.plugin.refreshCalendars();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Tasks without dates")
      .setDesc("Optionally collect undated tasks on today.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("hide", "Hide")
          .addOption("today", "Show on today")
          .setValue(this.plugin.settings.undatedTasks)
          .onChange(async (value) => {
            this.plugin.settings.undatedTasks = value as "hide" | "today";
            await this.plugin.saveSettings();
            this.plugin.refreshCalendars();
          }),
      );

    new Setting(containerEl)
      .setName("Default query")
      .setDesc("Tasks-style filters applied when opening the full calendar view.")
      .addTextArea((text) =>
        text
          .setPlaceholder("not done\npath includes Projects")
          .setValue(this.plugin.settings.defaultQuery)
          .onChange(async (value) => {
            this.plugin.settings.defaultQuery = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("New task file")
      .setDesc("Vault-relative Markdown file used when creating a task from a calendar day.")
      .addText((text) =>
        text
          .setPlaceholder("Tasks.md")
          .setValue(this.plugin.settings.newTaskFile)
          .onChange(async (value) => {
            this.plugin.settings.newTaskFile = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}

function isDatePreference(fields: string[]): fields is DateField[] {
  return (
    fields.length === 3 &&
    new Set(fields).size === 3 &&
    fields.every((field) => field === "scheduled" || field === "due" || field === "start")
  );
}
