
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

function ShimmerEffect({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted rounded-lg',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        'before:animate-[shimmer_2s_infinite]',
        className
      )}
    />
  );
}

export function LeadCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <ShimmerEffect className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <ShimmerEffect className="h-4 w-32" />
          <ShimmerEffect className="h-3 w-24" />
        </div>
        <ShimmerEffect className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex items-center justify-between pt-2">
        <ShimmerEffect className="h-5 w-20 rounded-full" />
        <ShimmerEffect className="h-3 w-28" />
      </div>
      <div className="flex gap-2 pt-1">
        <ShimmerEffect className="h-8 w-8 rounded-lg" />
        <ShimmerEffect className="h-8 w-8 rounded-lg" />
        <ShimmerEffect className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <ShimmerEffect className="h-4 w-20" />
        <ShimmerEffect className="h-8 w-8 rounded-lg" />
      </div>
      <ShimmerEffect className="h-8 w-28" />
      <ShimmerEffect className="h-3 w-16" />
    </div>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <ShimmerEffect className="h-5 w-5 rounded shrink-0" />
        <div className="flex-1 space-y-2">
          <ShimmerEffect className="h-4 w-3/4" />
          <ShimmerEffect className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <ShimmerEffect className="h-5 w-16 rounded-full" />
        <ShimmerEffect className="h-4 w-20" />
      </div>
    </div>
  );
}

export function GoalProgressSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <ShimmerEffect className="h-5 w-32" />
        <ShimmerEffect className="h-6 w-20 rounded-full" />
      </div>
      <ShimmerEffect className="h-3 w-full rounded-full" />
      <div className="flex justify-between">
        <ShimmerEffect className="h-4 w-16" />
        <ShimmerEffect className="h-4 w-16" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      
      {/* Goal progress */}
      <GoalProgressSkeleton />
      
      {/* Recent section */}
      <div className="space-y-3">
        <ShimmerEffect className="h-5 w-32" />
        <LeadCardSkeleton />
        <LeadCardSkeleton />
      </div>
    </div>
  );
}

export function LeadsListSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {/* Stage tabs */}
      <div className="flex gap-2 overflow-hidden">
        <ShimmerEffect className="h-8 w-24 rounded-full shrink-0" />
        <ShimmerEffect className="h-8 w-20 rounded-full shrink-0" />
        <ShimmerEffect className="h-8 w-28 rounded-full shrink-0" />
        <ShimmerEffect className="h-8 w-24 rounded-full shrink-0" />
      </div>
      
      {/* Lead cards */}
      <div className="space-y-3">
        <LeadCardSkeleton />
        <LeadCardSkeleton />
        <LeadCardSkeleton />
        <LeadCardSkeleton />
      </div>
    </div>
  );
}

export function TaskListSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <TaskCardSkeleton />
      <TaskCardSkeleton />
      <TaskCardSkeleton />
      <TaskCardSkeleton />
    </div>
  );
}
