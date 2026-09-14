import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import {
  VideoIcon,
  BellIcon,
  FileTextIcon,
  PlusIcon,
} from "../common/Icons";

const actions = [
  {
    label: "View Live Feed",
    icon: VideoIcon,
    to: "/surveillance",
  },
  {
    label: "Acknowledge Alert",
    icon: BellIcon,
    to: "/alerts",
  },
  {
    label: "View Evidence",
    icon: FileTextIcon,
    to: "/events",
  },
  {
    label: "Create Incident Report",
    icon: PlusIcon,
    to: "/events",
  },
];

/**
 * Quick actions. Limited to realistic operator actions only.
 */
function QuickActions() {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-white">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              to={a.to}
              className="group btn-focus inline-flex min-h-11 items-center justify-start gap-2 rounded-lg border border-white/20 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-900 transition-all duration-150 hover:border-white/20 hover:bg-transparent hover:text-white active:scale-[0.98]"
            >
              <Icon size={16} className="shrink-0 text-black transition-colors group-hover:text-white" />
              {a.label}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

export default QuickActions;
